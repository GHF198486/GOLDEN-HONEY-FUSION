import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PARTNER_WA = String(process.env.PARTNER_WHATSAPP || '96171127840').replace(/\D/g,'');
const OWNER_WA = String(process.env.OWNER_WHATSAPP || '').replace(/\D/g,'');
const DATA_DIR = path.join(__dirname,'data');
const DATA_FILE = path.join(DATA_DIR,'ghf-data.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE,JSON.stringify({customers:[],orders:[]},null,2));

function db(){return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));}
function save(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2));}
function id(prefix){return prefix+'-'+crypto.randomBytes(5).toString('hex').toUpperCase();}
function phone(v){return String(v||'').replace(/\D/g,'').replace(/^00/,'');}
function money(n){return Math.round(Number(n||0)*100)/100;}
function waUrl(to,text){return `https://wa.me/${phone(to)}?text=${encodeURIComponent(text)}`;}
function orderText(order,includeActions=false){
  const l=['GOLDEN HONEY FUSION','ORDER '+order.id,'Customer ID: '+order.customerId,'Customer: '+order.customer.name,'Phone: '+order.customer.phone,'Governorate: '+order.customer.province,'Town / City: '+order.customer.city,'Address: '+order.customer.address];
  if(order.customer.floor) l.push('Floor / Building: '+order.customer.floor);
  if(order.customer.notes) l.push('Notes: '+order.customer.notes);
  l.push('','ORDER ITEMS');
  order.items.forEach((i,index)=>{
    l.push(`${index+1}. ${i.product}${i.arabic ? ' — '+i.arabic : ''}`);
    l.push(`   SIZE: ${i.weight||'—'} | QTY: ${i.qty||1} | PRICE: $${money(i.lineTotal).toFixed(2)}`);
  });
  if(order.customer.location && order.customer.location.lat && order.customer.location.lng){
    const lat=Number(order.customer.location.lat), lng=Number(order.customer.location.lng);
    l.push('','DELIVERY LOCATION: https://www.google.com/maps?q='+encodeURIComponent(lat+','+lng));
  }
  l.push('','SUBTOTAL: $'+money(order.subtotal).toFixed(2));
  if(order.discountAmount) l.push('PRIVILEGE: -$'+money(order.discountAmount).toFixed(2));
  l.push('DELIVERY: $'+money(order.deliveryFee).toFixed(2),'TOTAL: $'+money(order.total).toFixed(2),'','ORDER STATUS: '+order.status);
  if(includeActions){l.push('','CONFIRM: '+order.confirmUrl,'SHIP: '+order.shipUrl);}
  return l.join('\n');
}
function makePrivilegeCode(d){
  const used=new Set(d.customers.map(x=>String(x.privilegeCode||'')));
  let code='';
  do{code=String(100000+crypto.randomInt(0,900000));}while(used.has(code));
  return code;
}
function customerFor(d,c){
  const p=phone(c.phone);
  let x=d.customers.find(v=>v.phone===p);
  if(!x){x={id:id('GHF-C'),phone:p,name:c.name,privilegeCode:makePrivilegeCode(d),purchases:0,consecutivePurchases:0,benefitRate:0,benefitBalance:0,benefitExpiresAt:null,benefitUsedOrderId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};d.customers.push(x);}
  if(!x.privilegeCode)x.privilegeCode=makePrivilegeCode(d);
  if(typeof x.purchases!=='number')x.purchases=0;
  if(typeof x.consecutivePurchases!=='number')x.consecutivePurchases=x.purchases;
  if(typeof x.benefitBalance!=='number')x.benefitBalance=0;
  x.name=c.name;x.updatedAt=new Date().toISOString();
  return x;
}
function computeBenefit(customer,baseAmount){
  // The benefit is earned for the NEXT purchase after a confirmed purchase.
  // 1st–3rd confirmed purchases => next purchase gets 3.3%.
  // 4th–6th confirmed purchases => next purchase gets 4%.
  // 7th+ confirmed purchases => next purchase gets 5%.
  const rate=customer.purchases>=7?0.05:customer.purchases>=4?0.04:0.033;
  return {rate,amount:money(Number(baseAmount||0)*rate),expiresAt:new Date(Date.now()+45*86400000).toISOString()};
}
function activeBenefit(customer){
  if(!customer || !customer.benefitBalance || !customer.benefitExpiresAt)return null;
  if(new Date(customer.benefitExpiresAt).getTime()<=Date.now()){
    customer.benefitBalance=0;customer.benefitRate=0;customer.benefitExpiresAt=null;customer.benefitUsedOrderId=null;
    return null;
  }
  if(customer.benefitUsedOrderId)return null;
  return {code:String(customer.privilegeCode||''),amount:money(customer.benefitBalance),rate:Number(customer.benefitRate)||0,expiresAt:customer.benefitExpiresAt};
}
async function sendCloud(to,text){
  const token=process.env.WHATSAPP_ACCESS_TOKEN;
  const pn=process.env.WHATSAPP_PHONE_NUMBER_ID;
  if(!token||!pn||!to) return {sent:false,reason:'WhatsApp Cloud API not configured'};
  const r=await fetch(`https://graph.facebook.com/v23.0/${pn}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:phone(to),type:'text',text:{preview_url:true,body:text}})});
  const j=await r.json();
  if(!r.ok) throw new Error(JSON.stringify(j));
  return {sent:true,response:j};
}

app.get('/health',(req,res)=>res.json({ok:true,service:'GHF backend',time:new Date().toISOString()}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/privileges/check', (req,res)=>{
  try{
    const d=db();
    const customer=d.customers.find(x=>x.phone===phone(req.query.phone));
    const code=String(req.query.code||'').trim();
    if(!customer || !code || code!==String(customer.privilegeCode||'')) return res.status(404).json({valid:false,message:'PRIVILEGE CODE NOT FOUND.'});
    const benefit=activeBenefit(customer);
    save(d);
    if(!benefit)return res.status(410).json({valid:false,message:'PRIVILEGE EXPIRED OR ALREADY USED.'});
    const requestedSubtotal=money(req.query.subtotal||0);
    const amount=Math.min(benefit.amount,Math.max(0,requestedSubtotal));
    res.json({valid:true,code:benefit.code,amount,rate:benefit.rate,expiresAt:benefit.expiresAt,expiresAtDisplay:new Date(benefit.expiresAt).toLocaleDateString()});
  }catch(e){console.error(e);res.status(500).json({valid:false,message:'PRIVILEGE CHECK FAILED.'});}
});

app.post('/api/orders',async(req,res)=>{
  try{
    const b=req.body||{}; const c=b.customer||{}; const items=Array.isArray(b.items)?b.items:[];
    if(!c.name||!c.phone||!c.province||!c.city||!c.address||!items.length) return res.status(400).json({error:'Missing required order fields'});
    const d=db(); const customer=customerFor(d,c);
    const subtotal=money(b.subtotal); const deliveryFee=money(b.deliveryFee||5);
    const submittedCode=String(b.discountCode||'').trim();
    let discountAmount=0;
    if(submittedCode){
      if(submittedCode!==String(customer.privilegeCode||'')) return res.status(400).json({error:'Invalid privilege code'});
      const benefit=activeBenefit(customer);
      if(!benefit)return res.status(400).json({error:'Privilege expired or already used'});
      discountAmount=Math.min(benefit.amount,subtotal);
    }
    const discountedSubtotal=money(Math.max(0,subtotal-discountAmount));
    const total=money(discountedSubtotal+deliveryFee);
    const order={id:id('GHF-O'),customerId:customer.id,customer:{...c,phone:phone(c.phone)},items,subtotal,discountCode:submittedCode||null,discountAmount,discountedSubtotal,deliveryFee,total,status:'NEW',createdAt:new Date().toISOString(),confirmedAt:null,shippedAt:null,confirmToken:crypto.randomBytes(18).toString('hex'),shipToken:crypto.randomBytes(18).toString('hex')};
    if(submittedCode)customer.benefitUsedOrderId=order.id;
    order.confirmUrl=`${BASE_URL}/api/orders/${order.id}/confirm?token=${order.confirmToken}`;
    order.shipUrl=`${BASE_URL}/api/orders/${order.id}/ship?token=${order.shipToken}`;
    d.orders.push(order); save(d);
    const partnerText=orderText(order,true);
    const partnerWhatsAppUrl=waUrl(PARTNER_WA,partnerText);
    // If Cloud API is configured for the partner number, send automatically; otherwise open the partner chat.
    let partnerApi={sent:false};
    if(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) partnerApi=await sendCloud(PARTNER_WA,partnerText);
    res.json({ok:true,orderId:order.id,customerId:customer.id,orderUrl:`${BASE_URL}/api/orders/${order.id}`,partnerWhatsAppUrl,partnerApi});
  }catch(e){console.error(e);res.status(500).json({error:'Could not create order'});}
});

app.get('/api/orders/:id',(req,res)=>{const d=db();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).send('Order not found');res.type('html').send(orderHtml(o));});

app.get('/api/orders/:id/confirm',async(req,res)=>{
  try{
    const d=db(); const o=d.orders.find(x=>x.id===req.params.id);
    if(!o||req.query.token!==o.confirmToken)return res.status(403).send('Invalid confirmation link');
    if(o.status==='NEW'){
      o.status='CONFIRMED';o.confirmedAt=new Date().toISOString();
      const c=d.customers.find(x=>x.id===o.customerId);
      c.purchases++;c.consecutivePurchases++;
      const earnedBase=money(o.discountedSubtotal!=null?o.discountedSubtotal:o.subtotal);
      const b=computeBenefit(c,earnedBase);
      c.benefitRate=b.rate;c.benefitBalance=b.amount;c.benefitExpiresAt=b.expiresAt;c.benefitUsedOrderId=null;
    }
    save(d);
    const c=d.customers.find(x=>x.id===o.customerId);
    // Customer receives approval only. The privilege message remains a manual GHF Business message.
    const customerMsg=`Golden Honey Fusion\n\nYour order ${o.id} has been accepted.\nCustomer ID: ${c.id}\nWe will update you when your order is shipped.`;
    const ownerMsg=`GHF ORDER CONFIRMED\nOrder: ${o.id}\nCustomer ID: ${c.id}\nCustomer: ${o.customer.name}\nPhone: ${o.customer.phone}\nPrivilege for next purchase: ${(c.benefitRate*100).toFixed(1)}% = $${c.benefitBalance.toFixed(2)}\nPrivilege Code: ${c.privilegeCode}\nValid until: ${new Date(c.benefitExpiresAt).toLocaleDateString()}`;
    let results=[];
    if(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID){
      results.push(await sendCloud(o.customer.phone,customerMsg));
      if(OWNER_WA)results.push(await sendCloud(OWNER_WA,ownerMsg));
    }
    res.type('html').send(actionHtml('ORDER CONFIRMED',o,results));
  }catch(e){console.error(e);res.status(500).send('Confirmation failed');}
});

app.get('/api/orders/:id/ship',async(req,res)=>{try{const d=db();const o=d.orders.find(x=>x.id===req.params.id);if(!o||req.query.token!==o.shipToken)return res.status(403).send('Invalid shipping link');if(o.status!=='SHIPPED'){o.status='SHIPPED';o.shippedAt=new Date().toISOString();}save(d);const c=d.customers.find(x=>x.id===o.customerId);const customerMsg=`Golden Honey Fusion\n\nYour order ${o.id} has been shipped.\nThank you for choosing Golden Honey Fusion.`;const ownerMsg=`GHF ORDER SHIPPED\nOrder: ${o.id}\nCustomer ID: ${c.id}\nCustomer: ${o.customer.name}\nPhone: ${o.customer.phone}\nBenefit balance: $${c.benefitBalance.toFixed(2)} at ${(c.benefitRate*100).toFixed(1)}%`;let results=[];if(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID){results.push(await sendCloud(o.customer.phone,customerMsg));if(OWNER_WA)results.push(await sendCloud(OWNER_WA,ownerMsg));}res.type('html').send(actionHtml('ORDER SHIPPED',o,results));}catch(e){console.error(e);res.status(500).send('Shipping update failed');}});

function actionHtml(title,o,results){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GHF</title><style>body{margin:0;background:#050505;color:#e8cf87;font-family:Georgia,serif;display:grid;place-items:center;min-height:100vh;text-align:center}.box{max-width:560px;width:88%;padding:38px;border:1px solid #6f5620;background:#0a0a0a;box-shadow:0 20px 70px #000}.sub{color:#aaa08f;font:13px Arial;line-height:1.8;margin-top:14px}</style></head><body><div class="box"><div style="font-size:12px;letter-spacing:4px">GOLDEN HONEY FUSION</div><h1>${title}</h1><div class="sub">Order ${o.id}<br>Customer ID ${o.customerId}<br>The status has been recorded.</div></div></body></html>`;}
function orderHtml(o){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GHF Order ${o.id}</title><style>body{background:#050505;color:#e7dfd2;font-family:Arial;padding:20px}.card{max-width:760px;margin:auto;background:#0a0a0a;border:1px solid #5d471b;padding:28px}.gold{color:#e8cf87}.row{padding:8px 0;border-bottom:1px solid #222}a{color:#e8cf87}</style></head><body><div class="card"><div class="gold" style="letter-spacing:4px">GOLDEN HONEY FUSION</div><h1 class="gold">ORDER ${o.id}</h1><div class="row">Customer ID: ${o.customerId}</div><div class="row">Status: ${o.status}</div><div class="row">Customer: ${escapeHtml(o.customer.name)}</div><div class="row">Phone: ${escapeHtml(o.customer.phone)}</div><div class="row">Governorate: ${escapeHtml(o.customer.province)}</div><div class="row">Town / City: ${escapeHtml(o.customer.city)}</div><div class="row">Address: ${escapeHtml(o.customer.address)}</div><h3 class="gold">ORDER ITEMS</h3>${o.items.map(i=>`<div class="row">${escapeHtml(i.product)} — ${escapeHtml(i.weight)} × ${i.qty} — $${money(i.lineTotal).toFixed(2)}</div>`).join('')}<p>SUBTOTAL $${money(o.subtotal).toFixed(2)}${o.discountAmount?`<br>PRIVILEGE -$${money(o.discountAmount).toFixed(2)}`:''}<br>DELIVERY $${money(o.deliveryFee).toFixed(2)}</p><p class="gold">TOTAL $${money(o.total).toFixed(2)}</p><p><a href="${o.confirmUrl}">CONFIRM ORDER</a> &nbsp; | &nbsp; <a href="${o.shipUrl}">SHIP / SEND ORDER</a></p></div></body></html>`;}
function escapeHtml(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

app.listen(PORT,()=>console.log(`GHF backend listening on ${PORT}`));
