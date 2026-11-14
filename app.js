(function () {
  "use strict";
  const STORAGE_KEY = "datax-sandbox-v1";
  const RATE_PER_GB = 1;
  const CONTRIBUTOR_SHARE = 0.70;
  const MARKET_FEE = 0.01;
  const fmt = function (n) { return Number(n || 0).toLocaleString("en-GH", {minimumFractionDigits:2, maximumFractionDigits:2}); };
  const money = function (n) { return "GH₵ " + fmt(n); };
  const units = function (n) { return fmt(n) + " DTX"; };
  const now = function () { return new Date().toISOString(); };
  const dateLabel = function (value) { return new Date(value).toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"}); };
  const initialState = function () {
    const base = Date.now();
    const events = [
      {id:"BAL-000108",date:new Date(base-3600000*3).toISOString(),source:"Residential Wi-Fi gateway",type:"Shared bandwidth",gb:4.2,gross:4.2,reward:2.94,status:"verified",demo:true},
      {id:"BAL-000107",date:new Date(base-3600000*9).toISOString(),source:"Managed hotspot",type:"Shared bandwidth",gb:3.6,gross:3.6,reward:2.52,status:"verified",demo:true},
      {id:"BAL-000106",date:new Date(base-86400000).toISOString(),source:"Residential Wi-Fi gateway",type:"Shared bandwidth",gb:5.1,gross:5.1,reward:3.57,status:"verified",demo:true},
      {id:"BAL-000105",date:new Date(base-86400000*2).toISOString(),source:"Enterprise network",type:"Shared bandwidth",gb:2.8,gross:2.8,reward:1.96,status:"verified",demo:true},
      {id:"BAL-000104",date:new Date(base-86400000*3).toISOString(),source:"Managed hotspot",type:"Shared bandwidth",gb:3.4,gross:3.4,reward:2.38,status:"verified",demo:true},
      {id:"BAL-000103",date:new Date(base-86400000*4).toISOString(),source:"Residential Wi-Fi gateway",type:"Shared bandwidth",gb:2.2,gross:2.2,reward:1.54,status:"verified",demo:true},
      {id:"BAL-000102",date:new Date(base-86400000*5).toISOString(),source:"Partner data voucher",type:"Entitlement record",gb:1.5,gross:1.5,reward:1.05,status:"verified",demo:true},
      {id:"BAL-000101",date:new Date(base-86400000*6).toISOString(),source:"Enterprise network",type:"Shared bandwidth",gb:2.0,gross:2.0,reward:1.4,status:"verified",demo:true}
    ];
    return {events:events,tokens:12,cash:42.5,rewardCapacity:100,convertedRewards:0,reserveCash:0,cashHistory:[],redemptions:[],tokenLog:[],transactions:[],sequence:109};
  };
  let state;
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialState(); } catch (e) { state = initialState(); }
  state.reserveCash=Number(state.reserveCash)||0; state.cashHistory=Array.isArray(state.cashHistory)?state.cashHistory:[]; state.redemptions=Array.isArray(state.redemptions)?state.redemptions:[];
  const save = function () { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); };
  const sum = function (key) { return state.events.reduce(function (a,e) { return a + Number(e[key] || 0); },0); };
  const toast = function (message) {
    const el = document.getElementById("toast");
    el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { el.classList.remove("show"); },2800);
  };
  const addTransaction = function (type, amount, detail, status) {
    state.transactions.unshift({id:"TX-"+Date.now().toString(36).toUpperCase(),type:type,amount:amount,detail:detail,status:status || "completed",date:now()});
  };
  const escapeHtml = function (s) { return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); };
  const statusPill = function (s) { return '<span class="status '+(s==="verified"?"verified":s==="pending"?"pending":s==="completed"?"completed":"demo")+'">'+escapeHtml(s.toUpperCase())+'</span>'; };
  const eventRow = function (e, detailed) {
    if (detailed) return '<tr><td class="ref">'+escapeHtml(e.id)+'</td><td>'+dateLabel(e.date)+'</td><td>'+escapeHtml(e.source)+'</td><td>'+escapeHtml(e.type)+'</td><td>'+fmt(e.gb)+' GB</td><td>'+money(e.gross)+'</td><td>'+statusPill(e.status)+'</td></tr>';
    return '<tr><td>'+dateLabel(e.date)+'</td><td>'+escapeHtml(e.source)+'</td><td>'+fmt(e.gb)+' GB</td><td>'+money(e.gross)+'</td><td>'+statusPill(e.status)+'</td></tr>';
  };
  const transactionRow = function (t) { return '<tr><td class="ref">'+escapeHtml(t.id)+'</td><td>'+escapeHtml(t.type)+'</td><td>'+dateLabel(t.date)+'</td><td>'+escapeHtml(t.detail)+'</td><td>'+statusPill(t.status)+'</td></tr>'; };
  const renderChart = function () {
    const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], totals=[0,0,0,0,0,0,0];
    state.events.forEach(function(e){const d=new Date(e.date);const diff=Math.floor((Date.now()-d.getTime())/86400000);if(diff>=0&&diff<7)totals[6-diff]+=e.gb;});
    const max=Math.max.apply(null,totals.concat([1]));
    document.getElementById("barChart").innerHTML=totals.map(function(v,i){const h=Math.max(4,v/max*100);return '<div class="bar-group"><div class="bar-pair"><div class="bar secondary" style="height:'+Math.max(3,h*.56)+'%"></div><div class="bar" style="height:'+h+'%"></div></div><span class="bar-label">'+days[i]+'</span></div>';}).join("");
  };
  const render = function () {
    const total=sum("gb"), reward=sum("reward");
    document.getElementById("metricBandwidth").innerHTML=fmt(total)+' <small>GB</small>';
    document.getElementById("metricRewards").textContent=money(reward);
    document.getElementById("metricTokens").innerHTML=fmt(state.tokens)+' <small>DTX</small>';
    document.getElementById("metricWallet").textContent=money(state.cash);
    document.getElementById("chartTotal").textContent=fmt(total)+" GB";
    document.getElementById("recentEvents").innerHTML=state.events.slice(0,5).map(function(e){return eventRow(e,false);}).join("");
    document.getElementById("ledgerTotal").innerHTML=fmt(total)+' <small>GB</small>';
    document.getElementById("ledgerEvents").textContent=state.events.length;
    document.getElementById("ledgerPending").textContent=state.events.filter(function(e){return e.status==="pending";}).length;
    const filter=document.getElementById("eventFilter").value;
    document.getElementById("ledgerEventsBody").innerHTML=state.events.filter(function(e){return filter==="all"||e.status===filter;}).map(function(e){return eventRow(e,true);}).join("")||'<tr><td colspan="7" class="empty-state">No events match this filter.</td></tr>';
    document.getElementById("tokenPageBalance").textContent=units(state.tokens);
    document.getElementById("reserveAvailable").textContent=money(state.reserveCash);
    document.getElementById("redeemableValue").textContent=money(state.tokens);
    document.getElementById("pendingRedemption").textContent=money(state.redemptions.filter(function(r){return r.status==="pending";}).reduce(function(a,r){return a+r.net;},0));
    document.getElementById("reserveCoverage").textContent=(state.tokens>0?((state.reserveCash/state.tokens)*100):100).toFixed(1)+"%";
    document.getElementById("cashHistory").innerHTML=state.cashHistory.map(function(h){return '<tr><td class="ref">'+escapeHtml(h.id)+'</td><td>'+dateLabel(h.date)+'</td><td>'+escapeHtml(h.type)+'</td><td>'+(h.units?units(h.units):"—")+'</td><td>'+money(h.amount)+'</td><td>'+statusPill(h.status)+'</td></tr>';}).join("")||'<tr><td colspan="6" class="empty-state">No reserve or redemption records yet.</td></tr>';
    document.getElementById("marketCash").textContent=money(state.cash);
    document.getElementById("marketTokens").textContent=units(state.tokens);
    document.getElementById("walletCashLarge").textContent=money(state.cash);
    document.getElementById("walletTokensLarge").textContent=units(state.tokens);
    document.getElementById("walletTransactions").innerHTML=state.transactions.map(function(t){return '<tr><td class="ref">'+escapeHtml(t.id)+'</td><td>'+escapeHtml(t.type)+'</td><td>'+dateLabel(t.date)+'</td><td>'+escapeHtml(t.amount)+'</td><td>'+statusPill(t.status)+'</td></tr>';}).join("")||'<tr><td colspan="5" class="empty-state">No wallet transactions yet.</td></tr>';
    document.getElementById("activityBody").innerHTML=state.transactions.map(transactionRow).join("")||'<tr><td colspan="5" class="empty-state">No activity recorded yet.</td></tr>';
    document.getElementById("tokenLog").innerHTML=state.tokenLog.map(function(t){return '<tr><td class="ref">'+escapeHtml(t.id)+'</td><td>'+dateLabel(t.date)+'</td><td>'+money(t.value)+'</td><td>'+units(t.units)+'</td><td>'+statusPill("completed")+'</td></tr>';}).join("")||'<tr><td colspan="5" class="empty-state">No token conversions yet.</td></tr>';
    renderChart(); updateSellPreview(); updateConvertPreview();
    save();
  };
  const updateSellPreview = function () {
    const amount=Math.max(0,Number(document.getElementById("sellAmount").value)||0),gross=amount,fee=gross*MARKET_FEE;
    document.getElementById("sellGross").textContent=money(gross);
    document.getElementById("sellFee").textContent="− "+money(fee);
    document.getElementById("sellNet").textContent=money(gross-fee);
  };
  const updateConvertPreview = function () {
    const amount=Math.max(0,Number(document.getElementById("convertAmount").value)||0);
    document.getElementById("conversionPreview").textContent=units(amount);
  };
  const products=[
    {id:"bundle-5",icon:"⌁",name:"5GB data bundle",desc:"Illustrative prepaid connectivity package",price:25},
    {id:"bundle-10",icon:"◉",name:"10GB data bundle",desc:"Illustrative prepaid connectivity package",price:45},
    {id:"digital-pass",icon:"✧",name:"Digital service pass",desc:"Example subscription voucher",price:15}
  ];
  const renderProducts = function () {
    document.getElementById("productGrid").innerHTML=products.map(function(p){return '<article class="product-card"><div class="product-art">'+p.icon+'</div><h3>'+p.name+'</h3><p>'+p.desc+'</p><div class="product-buy"><strong>'+money(p.price)+'</strong><button data-buy="'+p.id+'">Buy demo</button></div></article>';}).join("");
  };
  const showView = function (name) {
    document.querySelectorAll(".view").forEach(function(v){v.classList.toggle("active",v.id==="view-"+name);});
    document.querySelectorAll(".nav-item[data-view]").forEach(function(b){b.classList.toggle("active",b.dataset.view===name);});
    const labels={overview:"Overview",bandwidth:"Bandwidth assets",token:"Token studio",market:"Marketplace",wallet:"Wallet",cash:"Cash & reserves",activity:"Activity",settings:"Settings"};
    document.getElementById("pageCrumb").textContent=labels[name]||"Overview";
    document.getElementById("sidebar").classList.remove("open");
    window.scrollTo({top:0,behavior:"smooth"});
  };
  const openModal = function () {const m=document.getElementById("contributionModal");m.classList.add("open");m.setAttribute("aria-hidden","false");};
  const closeModal = function () {const m=document.getElementById("contributionModal");m.classList.remove("open");m.setAttribute("aria-hidden","true");};
  document.addEventListener("click",function(e){
    const nav=e.target.closest("[data-view]");if(nav){showView(nav.dataset.view);return;}
    const go=e.target.closest("[data-navigate]");if(go){showView(go.dataset.navigate);return;}
    const sim=e.target.closest('[data-action="simulate"]');if(sim){openModal();return;}
    if(e.target.closest("[data-close-modal]")){closeModal();return;}
    const buy=e.target.closest("[data-buy]");if(buy){purchase(buy.dataset.buy);return;}
  });
  document.getElementById("menuToggle").addEventListener("click",function(){document.getElementById("sidebar").classList.toggle("open");});
  document.getElementById("bannerDismiss").addEventListener("click",function(){document.querySelector(".demo-banner").style.display="none";});
  document.getElementById("helpButton").addEventListener("click",function(){toast("DataX prototype: no live carrier, gateway, payment or blockchain connection is active.");});
  document.getElementById("eventFilter").addEventListener("change",render);
  document.getElementById("sellAmount").addEventListener("input",updateSellPreview);
  const updateRedeemPreview=function(){const a=Math.max(0,Number(document.getElementById("redeemAmount").value)||0),fee=a*MARKET_FEE;document.getElementById("redeemGross").textContent=money(a);document.getElementById("redeemFee").textContent="− "+money(fee);document.getElementById("redeemNet").textContent=money(a-fee);};
  document.getElementById("redeemAmount").addEventListener("input",updateRedeemPreview);
  document.getElementById("reserveFunding").addEventListener("input",function(){this.setCustomValidity(Number(this.value)>0?"":"Enter a positive amount.");});
  document.getElementById("fundReserveButton").addEventListener("click",function(){const amount=Number(document.getElementById("reserveFunding").value),ref=document.getElementById("reserveReference").value.trim();if(!Number.isFinite(amount)||amount<=0||amount>10000000){toast("Enter a reserve amount above zero and below GH₵ 10,000,000.");return;}if(!ref){toast("Add a reference for this simulated funding record.");return;}state.reserveCash+=amount;state.cashHistory.unshift({id:"RSV-"+Date.now().toString(36).toUpperCase(),date:now(),type:"Simulated reserve funding · "+ref,amount:amount,units:0,status:"demo"});addTransaction("Simulated reserve funding",money(amount),"Local reserve ledger only · "+ref,"demo");render();toast("Simulated reserve entry recorded. No money was deposited.");});
  document.getElementById("redeemButton").addEventListener("click",function(){const amount=Number(document.getElementById("redeemAmount").value);if(!Number.isFinite(amount)||amount<=0){toast("Enter a valid DTX amount.");return;}if(amount>state.tokens){toast("Insufficient DTX balance.");return;}const gross=amount,fee=gross*MARKET_FEE,net=gross-fee;if(state.reserveCash<state.tokens){toast("Redemption paused: the reserve does not fully cover outstanding DTX. Required backing: "+money(state.tokens)+".");return;}state.tokens-=amount;state.reserveCash-=net;state.cash+=net;const id="RDM-"+Date.now().toString(36).toUpperCase();state.redemptions.unshift({id:id,date:now(),gross:gross,fee:fee,net:net,status:"demo"});state.cashHistory.unshift({id:id,date:now(),type:"DTX cash redemption",amount:net,units:amount,status:"completed"});addTransaction("DTX cash redemption",money(net),units(amount)+" repurchased · fee "+money(fee),"demo");render();toast("DTX repurchased in the sandbox. No external cash payout occurred.");});
  document.getElementById("convertAmount").addEventListener("input",updateConvertPreview);
  document.getElementById("contributionGb").addEventListener("input",function(){document.getElementById("contributionEstimate").textContent=money(Math.max(0,Number(this.value)||0)*RATE_PER_GB);});
  document.getElementById("contributionForm").addEventListener("submit",function(e){
    e.preventDefault();
    const gb=Number(document.getElementById("contributionGb").value);
    if(!Number.isFinite(gb)||gb<=0||gb>500){toast("Enter a volume between 0.01 and 500 GB.");return;}
    const source=document.getElementById("contributionSource").value;
    const type=document.getElementById("contributionType").value;
    const gross=gb*RATE_PER_GB,reward=gross*CONTRIBUTOR_SHARE;
    state.events.unshift({id:"BAL-"+String(state.sequence++).padStart(6,"0"),date:now(),source:source,type:type==="voucher"?"Entitlement record":"Shared bandwidth",gb:gb,gross:gross,reward:reward,status:"verified",demo:true});
    addTransaction("Demo contribution",fmt(gb)+" GB",source+" · estimated reward "+money(reward));
    closeModal();render();toast("Demo bandwidth event added to your local ledger.");showView("bandwidth");
  });
  document.getElementById("convertButton").addEventListener("click",function(){
    const amount=Number(document.getElementById("convertAmount").value);
    if(!Number.isFinite(amount)||amount<=0){toast("Enter a valid reward amount.");return;}
    const availableRewards=Math.max(0,sum("reward")-Number(state.convertedRewards||0));
    if(amount>availableRewards){toast("Amount exceeds unconverted eligible demo rewards ("+money(availableRewards)+").");return;}
    if(state.reserveCash<state.tokens+amount){toast("Issuance blocked: the reserve must cover existing DTX plus the new issuance. Required reserve: "+money(state.tokens+amount)+".");return;}
    state.convertedRewards=(Number(state.convertedRewards)||0)+amount;state.tokens+=amount;
    const entry={id:"MINT-DEMO-"+Date.now().toString(36).toUpperCase(),date:now(),value:amount,units:amount};
    state.tokenLog.unshift(entry);addTransaction("Demo token conversion",units(amount),money(amount)+" allocated to sandbox DTX");
    render();toast("Sandbox conversion completed. No blockchain transaction was created.");
  });
  document.getElementById("sellButton").addEventListener("click",function(){
    const amount=Number(document.getElementById("sellAmount").value);
    if(!Number.isFinite(amount)||amount<=0){toast("Enter a valid token amount.");return;}
    if(amount>state.tokens){toast("Insufficient DTX balance.");return;}
    const gross=amount,fee=gross*MARKET_FEE,net=gross-fee;
    if(state.reserveCash<state.tokens){toast("Repurchase paused: reserve backing is below outstanding DTX. Required backing: "+money(state.tokens)+".");return;}
    state.tokens-=amount;state.reserveCash-=net;state.cash+=net;
    const ref="BUYBACK-"+Date.now().toString(36).toUpperCase();state.cashHistory.unshift({id:ref,date:now(),type:"DTX market repurchase",amount:net,units:amount,status:"completed"});
    addTransaction("DTX reserve repurchase",money(net),units(amount)+" repurchased · fee "+money(fee),"demo");
    render();toast("DTX repurchased against the sandbox reserve. No external payout occurred.");
  });
  function purchase(id){
    const p=products.find(function(x){return x.id===id;});if(!p)return;
    if(state.cash<p.price){toast("Insufficient demo wallet balance.");return;}
    state.cash-=p.price;addTransaction("Demo purchase","− "+money(p.price),p.name+" · no fulfilment");
    render();toast("Demo purchase recorded. No real product or data bundle was delivered.");
  }
  document.getElementById("exportCsv").addEventListener("click",function(){
    const rows=[["Reference","Date","Source","Type","Volume GB","Gross value GHS","Reward GHS","Status"]].concat(state.events.map(function(e){return [e.id,e.date,e.source,e.type,e.gb,e.gross,e.reward,e.status];}));
    const csv=rows.map(function(row){return row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(",");}).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="datax-bandwidth-ledger.csv";a.click();URL.revokeObjectURL(url);toast("Ledger CSV exported.");
  });
  document.getElementById("resetButton").addEventListener("click",function(){
    if(!window.confirm("Reset all local DataX demo activity and restore the original sample balances?"))return;
    state=initialState();render();toast("Demo data has been reset.");
  });
  renderProducts();render();updateRedeemPreview();
})();