/// Serial ownership for CloudKit transport and its disk cache, separate from UI work.
@globalActor public actor CloudActor {
    public static let shared = CloudActor()
}
