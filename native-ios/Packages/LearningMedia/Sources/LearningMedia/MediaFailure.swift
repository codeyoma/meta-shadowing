/// Public failures never expose installed paths, private content or OS diagnostics.
public enum MediaFailure: Error, Sendable, Equatable {
    case unavailable, invalidAsset, timedOut, accessDenied, cancelled
}
