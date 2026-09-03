// Authoritative DABBIR owner command center entrypoint.
// Production and tests must target this stable file. Numbered owner-command-center files are legacy implementation history/rollback layers only; do not create new numbered production entrypoints.
import dashboard from './owner-command-center-v29.js';

export default function handler(req,res){
  return dashboard(req,res);
}
