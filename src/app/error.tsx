"use client";

import BrowseError from "./(learner)/error";

// A segment's own error boundary does not wrap its layout's server data reads.
export default function AppError({ retry }: { retry: () => void }) {
  return <main className="page mx-auto w-full max-w-[430px] justify-center px-5">
    <BrowseError retry={retry} />
  </main>;
}
