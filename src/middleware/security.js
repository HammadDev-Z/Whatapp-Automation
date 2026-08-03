'use strict';
const crypto = require('node:crypto');
function requireAuth(req,res,next){if(req.session?.authenticated)return next();return res.redirect('/login');}
function ensureCsrf(req,_res,next){if(!req.session.csrfToken)req.session.csrfToken=crypto.randomBytes(32).toString('hex');next();}
function verifyCsrf(req,res,next){const a=Buffer.from(String(req.body?._csrf||''));const e=Buffer.from(String(req.session?.csrfToken||''));if(!a.length||a.length!==e.length||!crypto.timingSafeEqual(a,e))return res.status(403).send('Invalid CSRF token');next();}
function safeEqual(a,b){const l=Buffer.from(String(a));const r=Buffer.from(String(b));return l.length===r.length&&crypto.timingSafeEqual(l,r);}
module.exports={requireAuth,ensureCsrf,verifyCsrf,safeEqual};
