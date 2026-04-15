// empty-module.js
// Webpack alias target for optional deps that are browser-incompatible
// (e.g. @react-native-async-storage/async-storage, pino-pretty).
// Exporting an empty object satisfies the import without any runtime cost.
module.exports = {};
