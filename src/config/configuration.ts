import { readFileSync } from 'fs';
import * as path from 'path';
import * as _ from 'lodash';

export default () => {
  const env = process.env.NODE_ENV || 'production';
  const rootPath = process.cwd();
  
  const baseConfigPath = path.join(rootPath, 'config', 'base.json');
  const envConfigPath = path.join(rootPath, 'config', `${env}.json`);
  
  let baseConfig = {};
  let envConfig = {};
  let parentConfig = {};

  try {
    baseConfig = JSON.parse(readFileSync(baseConfigPath, 'utf8'));
  } catch (e) {
    // ignore
  }

  try {
    envConfig = JSON.parse(readFileSync(envConfigPath, 'utf8'));
  } catch (e) {
    // ignore
  }
  
  if (env === 'local') {
       try {
        const prodConfigPath = path.join(rootPath, 'config', 'production.json');
        parentConfig = JSON.parse(readFileSync(prodConfigPath, 'utf8'));
      } catch (e) {
          // ignore
      }
  }

  // Deep merge: Base <- Parent <- Env
  return _.merge({}, baseConfig, parentConfig, envConfig);
};
