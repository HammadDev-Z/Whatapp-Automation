'use strict';
const path=require('node:path');
const express=require('express');
const session=require('express-session');
const PgStore=require('connect-pg-simple')(session);
const {createDashboardRouter}=require('./routes/dashboard');
function createApp({pool,config,botState={ready:false,authenticated:false}}){
 const app=express();
 if(config.env==='production')app.set('trust proxy',1);
 app.disable('x-powered-by');
 app.use(express.urlencoded({extended:false,limit:'100kb'}));
 app.use(express.static(path.join(__dirname,'..','public'),{maxAge:config.env==='production'?'1d':0}));
 app.use(session({store:new PgStore({pool,tableName:'dashboard_sessions'}),name:'wcb.sid',secret:config.sessionSecret||'development-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'strict',secure:config.env==='production',maxAge:8*60*60*1000}}));
 app.get('/',(_req,res)=>res.redirect('/dashboard'));
 app.get('/health',async(_req,res)=>{let database=false;try{await pool.query('SELECT 1');database=true;}catch{}const ok=database;res.status(ok?200:503).json({service:ok?'ready':'degraded',database,whatsapp:{ready:Boolean(botState.ready),authenticated:Boolean(botState.authenticated)}});});
 app.use(createDashboardRouter({pool,config}));
 app.use((error,_req,res,_next)=>{const status=error.code==='LIMIT_FILE_SIZE'?413:500;res.status(status).send(status===413?'CSV file is too large':'An unexpected error occurred');});
 return app;
}
module.exports={createApp};
