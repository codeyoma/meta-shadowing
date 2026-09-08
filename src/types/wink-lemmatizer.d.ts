declare module "wink-lemmatizer" {
  const lemmatize: {
    verb(word: string): string;
    noun(word: string): string;
    adjective(word: string): string;
  };
  export default lemmatize;
}
