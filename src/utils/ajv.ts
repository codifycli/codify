import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020.default({
  allErrors: true,
  strict: true,
});

addFormats.default(ajv);

export { ajv };
