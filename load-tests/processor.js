/**
 * Custom processor functions for Artillery load tests
 *
 * Provides utility functions for generating test data, processing responses,
 * and custom assertions beyond Artillery's built-in capabilities.
 */

/**
 * Generate a random string of specified length
 * Used in Artillery scenarios as: $randomString(8)
 */
function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a random number between min and max
 * Used in Artillery scenarios as: $randomNumber(1, 1000)
 */
function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get current timestamp in milliseconds
 * Used in Artillery scenarios as: $timestamp
 */
function timestamp() {
  return Date.now();
}

/**
 * Process response and validate structure
 * Called after each request for custom validation
 */
function processResponse(requestParams, response, context, ee, next) {
  // Log response status and headers for debugging
  context.vars['lastStatusCode'] = response.statusCode;
  context.vars['lastContentType'] = response.headers['content-type'];

  // Custom assertion: check for required headers
  if (response.statusCode >= 200 && response.statusCode < 300) {
    if (!response.headers['content-type']?.includes('application/json')) {
      ee.emit('customStat', {
        stat: 'invalid_content_type',
        value: 1
      });
    }
  }

  return next();
}

/**
 * Pre-processor: Runs before each request
 * Useful for setting dynamic values or request modifications
 */
function beforeRequest(requestParams, context, ee, next) {
  // Ensure Authorization header is always set
  if (!requestParams.headers) {
    requestParams.headers = {};
  }

  if (!requestParams.headers.Authorization && context.vars.apiKey) {
    requestParams.headers.Authorization = `Bearer ${context.vars.apiKey}`;
  }

  return next();
}

/**
 * Custom stat tracking for business metrics
 * Called to track domain-specific success/failure metrics
 */
function trackBusinessMetric(requestParams, response, context, ee, next) {
  // Track cardholder creation success rate
  if (requestParams.url?.includes('/cardholders') && requestParams.method === 'POST') {
    if (response.statusCode === 201) {
      ee.emit('customStat', {
        stat: 'cardholder_created',
        value: 1
      });
    } else {
      ee.emit('customStat', {
        stat: 'cardholder_failed',
        value: 1
      });
    }
  }

  // Track value load creation
  if (requestParams.url?.includes('/value_loads/load') && requestParams.method === 'POST') {
    if (response.statusCode === 201) {
      ee.emit('customStat', {
        stat: 'value_load_created',
        value: 1
      });
    }
  }

  return next();
}

// Export functions for Artillery
module.exports = {
  randomString,
  randomNumber,
  timestamp,
  processResponse,
  beforeRequest,
  trackBusinessMetric
};
