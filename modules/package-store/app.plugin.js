const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withPackageStore(config) {
  return withInfoPlist(config, config => {
    // Set locally for the owner-approved product. Never invent a live product ID.
    const id = process.env.APPLE_BOOK_PRODUCT_ID?.trim();
    if (id) config.modResults.LearningBookProductID = id;
    else delete config.modResults.LearningBookProductID;
    return config;
  });
};
