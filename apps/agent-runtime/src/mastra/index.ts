import { Mastra } from '@mastra/core';
import { config } from '../config/index.js';

if (config.openaiBaseUrl) {
  process.env.OPENAI_BASE_URL = config.openaiBaseUrl;
}

export const mastra = new Mastra({});
