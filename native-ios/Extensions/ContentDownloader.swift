import BackgroundAssets
import ExtensionFoundation

/// The asset-pack manifests own download policy; content authorization remains in the app.
@main struct ContentDownloader: ManagedDownloaderExtension {}
