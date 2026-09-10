import { OfflineLearning } from "./offline-learning";

// No cookies, headers, authenticated layout, catalog query, or account data.
export const dynamic = "force-static";
export default function OfflinePage() {
  return <><meta name="device-offline-shell" content="1" /><OfflineLearning /></>;
}
