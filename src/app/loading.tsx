import BrowseLoading from "./(learner)/loading";

export default function AppLoading() {
  return <main className="page mx-auto w-full max-w-[430px] px-5" aria-busy="true">
    <BrowseLoading />
  </main>;
}
