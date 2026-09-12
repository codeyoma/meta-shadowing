import { Redirect } from 'expo-router';

// An inert native bar item, not a destination. Guard accidental direct links too.
export default function Brand() {
  return <Redirect href="/" />;
}
