// Local internal-test build override; normal builds keep the checked-in config.
module.exports = ({ config }) => {
  const build = process.env.APPLE_INTERNAL_BUILD_NUMBER;
  if (build && !/^[1-9][0-9]*$/.test(build)) throw Error('Invalid internal build number.');
  return build ? { ...config, ios: { ...config.ios, buildNumber: build } } : config;
};
