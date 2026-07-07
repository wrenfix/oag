'use strict';

function requireToml() {
  try {
    // eslint-disable-next-line global-require
    return require('@iarna/toml');
  } catch (error) {
    throw new Error('TOML support not installed. Please add dependency @iarna/toml.');
  }
}

module.exports = {
  requireToml,
};
