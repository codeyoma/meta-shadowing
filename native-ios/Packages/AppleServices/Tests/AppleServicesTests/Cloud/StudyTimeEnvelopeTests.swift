import Foundation
import LearningDomain
import Testing
@testable import AppleServices

@CloudActor struct StudyTimeEnvelopeTests {
    @Test func versionSixEnvelopePreservesResetAuthority() throws {
        #expect(try ProgressEnvelope.generation(LearningBackupCodec.encode(.empty)) == "")
        let request = UUID().uuidString.lowercased()
        let empty = try LearningBackupCodec.encode(LearningBackup.empty.withResetGeneration(request))
        #expect(try ProgressEnvelope.generation(empty) == request)
        try ProgressEnvelope.validateReset(empty, requestId: request)
        // Version 5 remains a real historical fixture, not a current export nested in version 5.
        let root = try JSONSerialization.jsonObject(with: empty) as! [String: Any]
        let legacy = try JSONSerialization.data(withJSONObject: ["version": 5, "generation": request, "progress": root["progress"]!])
        try ProgressEnvelope.validateReset(legacy, requestId: request)
    }
    @Test func resetRejectsNonemptyTimeCounters() throws {
        let request = UUID().uuidString.lowercased()
        var data = try LearningBackup.empty.withResetGeneration(request)
        try data.setStudyTimeCounters([StudyTimeCounter(language: "english", book: "sample", replicaID: "replica", milliseconds: 0)])
        let payload = try LearningBackupCodec.encode(data)
        #expect(try ProgressEnvelope.generation(payload) == request)
        #expect(throws: ProgressCloudError.corrupt) { try ProgressEnvelope.validateReset(payload, requestId: request) }
    }
}
