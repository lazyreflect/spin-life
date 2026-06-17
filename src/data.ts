import countries from '../data/countries.json';
import params from '../data/model-params.json';
import names from '../data/names.json';
import careersData from '../data/careers.json';
import bandsData from '../data/bands.json';
import imputation from '../data/imputation.json';
import luckCdf from '../data/luckCdf.json';
import copy from '../data/copy.json';
import { makeRoller } from './model/roll.js';

export const roller = makeRoller({
  countries: countries as any,
  params: params as any,
  names: names as any,
  careers: (careersData as any).careers,
  bands: (bandsData as any).bands,
  imputation: imputation as any,
  luckCdf: luckCdf as any,
  copy: copy as any,
  seed: undefined, // live app: draw a fresh random seed each session
});
