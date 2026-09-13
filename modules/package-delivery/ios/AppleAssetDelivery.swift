import BackgroundAssets
import Foundation
import Synchronization
import System

struct AppleAssetDelivery: AssetDelivery {
  let assetPackID: String

  func download(progress: @escaping @Sendable (Double) async -> Void) async throws {
    let manager = AssetPackManager.shared
    let pack = try await manager.assetPack(withID: assetPackID)
    try Task.checkCancellation()
    let cancellation = DownloadCancellation()
    let updates = manager.statusUpdates(forAssetPackWithID: assetPackID)
    let observer = Task {
      for await update in updates {
        if Task.isCancelled { break }
        if case .downloading(_, let nativeProgress) = update {
          cancellation.attach(nativeProgress)
          await progress(nativeProgress.fractionCompleted)
        }
      }
    }
    defer { observer.cancel() }
    try await withTaskCancellationHandler {
      try Task.checkCancellation()
      // Keep observing until the OS request settles, even when our caller cancels
      // before the first Progress arrives. Its eventual Progress must still be cancelled.
      let availability = Task {
        if #available(iOS 26.4, *) {
          try await manager.ensureLocalAvailability(of: pack, requireLatestVersion: false)
        } else {
          try await manager.ensureLocalAvailability(of: pack)
        }
      }
      try await availability.value
      try Task.checkCancellation()
    } onCancel: {
      // Cancelling a Swift Task alone does not cancel Background Assets' OS-owned download.
      cancellation.cancel()
    }
  }

  func contents(_ file: String) throws -> Data {
    try AssetPackManager.shared.contents(at: FilePath(file), searchingInAssetPackWithID: assetPackID)
  }
}

private final class DownloadCancellation: Sendable {
  private let state = Mutex<(cancelled: Bool, progress: Progress?)>((false, nil))
  func attach(_ progress: Progress) {
    let cancelled = state.withLock { value in value.progress = progress; return value.cancelled }
    if cancelled { progress.cancel() }
  }
  func cancel() {
    let progress = state.withLock { value in value.cancelled = true; return value.progress }
    progress?.cancel()
  }
}
