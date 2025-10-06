// ---------- Estado global ----------
let currentScenario = null;
let processStart = 0;
let executedSteps = 0;
let runtimeRAF = null;

let vars = {};        // variables en tiempo real (order, auth, inventory, reply, compensation)
let events = [];      // cronología

// velocidad: 1..200 => factor 0.1x..10x (más alto = más rápido)
let speedFactor = 1;

// ---------- DOM ----------
// Los elementos se inicializan de forma segura después de que el DOM esté listo
let el = {};

// ---------- Pasos (mapeo a BPEL) ----------
/*
  Mapeo BPEL:
  - Recibir       -> receive
  - Autorizar     -> invoke (sync)
  - Decisión      -> if
  - Reservar      -> invoke (sync)
  - Responder     -> reply
  - Reembolso (solo si falla inventario) -> compensation (deshacer efecto de invoke previo)
*/
const STEPS = [
  { id: 'receive',   name: 'Recibir Solicitud',       desc: 'Procesando solicitud entrante',  icon: 'download' },
  { id: 'payment',   name: 'Autorizar Pago',          desc: 'Autorizando proveedor de pago',  icon: 'credit_card' },
  { id: 'decision',  name: '¿Pago Aprobado?',         desc: 'Evaluando autorización',         icon: 'help' },
  { id: 'inventory', name: 'Reservar Inventario',     desc: 'Reservando elementos en stock',  icon: 'inventory_2' },
  // Paso de compensación (usado condicionalmente)
  { id: 'refund',    name: 'Reembolsar Pago (Comp.)', desc: 'Compensando pago anterior',      icon: 'undo' },
  { id: 'reply',     name: 'Responder',               desc: 'Enviando respuesta final',       icon: 'upload' },
];

// ---------- Inicialización ----------
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar elementos DOM de forma segura
  el = {
    statusPing: document.getElementById('status-ping'),
    statusDot:  document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    darkToggle: document.getElementById('dark-toggle'),
    btnHappy:   document.getElementById('btn-happy'),
    btnReject:  document.getElementById('btn-reject'),
    btnStock:   document.getElementById('btn-nostock'),
    speed:      document.getElementById('speed'),
    speedVal:   document.getElementById('speed-value'),
    stepCards:  document.getElementById('step-cards'),
    timeline:   document.getElementById('timeline'),
    kpiRuntime: document.getElementById('kpi-runtime'),
    kpiSteps:   document.getElementById('kpi-steps'),
    kpiRetries: document.getElementById('kpi-retries'),
    varsPre:    document.getElementById('variables-json'),
    copyBtn:    document.getElementById('copy-json'),
  };

  // Solo renderizar elementos del demo si estamos en la página principal
  if (el.stepCards) {
    renderSteps();
    renderTimeline();
    renderVars();
    updateKPIs(0);
  }

  // Modo oscuro
  if (localStorage.getItem('darkMode') === 'true' ||
     (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }

  // Eventos - Dark toggle (presente en ambas páginas)
  if (el.darkToggle) {
    el.darkToggle.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('darkMode', isDark);
    });
  }

  // Eventos del demo principal (solo en index.html)
  if (el.btnHappy) {
    el.btnHappy.addEventListener('click', () => run('happy'));
  }
  if (el.btnReject) {
    el.btnReject.addEventListener('click', () => run('reject'));
  }
  if (el.btnStock) {
    el.btnStock.addEventListener('click',  () => run('nostock'));
  }

  // Control de velocidad (solo en demo principal)
  if (el.speed) {
    el.speed.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      
      // Nueva lógica: 1..200 -> 0.1x..10x (100 => 1x)
      if (v <= 100) {
        // 1->0.1x, 100->1x (escala logarítmica para mejor control en velocidades lentas)
        speedFactor = 0.1 + (v - 1) * 0.9 / 99;
      } else {
        // 101->1.1x, 200->10x (escala más agresiva para velocidades altas)
        speedFactor = 1 + (v - 100) * 9 / 100;
      }
      
      // Mostrar el factor de velocidad con formato amigable
      if (el.speedVal) {
        el.speedVal.textContent = speedFactor < 1 
          ? (speedFactor * 100).toFixed(0) + '%'
          : speedFactor.toFixed(1) + 'x';
      }
    });
  }

  // Botón de copiar JSON (solo en demo principal)
  if (el.copyBtn) {
    el.copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(
        Object.keys(vars).length ? JSON.stringify(vars, null, 2) : '{}'
      );
      const prev = el.copyBtn.innerHTML;
      el.copyBtn.innerHTML = '<span class="material-symbols-outlined text-base mr-1">check</span> ¡Copiado!';
      setTimeout(() => (el.copyBtn.innerHTML = prev), 900);
    });
  }

  // Solo establecer estado si estamos en la página principal del demo
  if (el.statusText) {
    setStatus('ready');
  }
  
  // Inicializar actividades interactivas solo si estamos en la página de actividades
  if (document.getElementById('team-activities')) {
    initInteractiveActivities();
  }
});

// ---------- Renderizado ----------
function renderSteps() {
  if (el.stepCards) {
    el.stepCards.innerHTML = STEPS.map(s => stepCardTemplate(s)).join('');
  }
}

function stepCardTemplate(step) {
  return `
    <div id="step-${step.id}" class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4 shadow-sm opacity-60">
      <div class="flex items-center gap-4">
        <div class="step-icon flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <span class="material-symbols-outlined text-3xl">${step.icon}</span>
        </div>
        <div class="flex-grow">
          <div class="flex justify-between items-center">
            <p class="font-bold text-gray-800 dark:text-white">${step.name}</p>
            <span class="step-status inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Pending</span>
          </div>
          <p class="step-desc text-sm text-gray-600 dark:text-gray-300 mt-0.5">${step.desc}</p>
        </div>
      </div>
      <div class="mt-3 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div class="step-bar h-1 rounded-full bg-primary" style="width:0%"></div>
      </div>
    </div>
  `;
}

function setStepState(id, state, newDesc, durationMs) {
  const root = document.getElementById(`step-${id}`);
  if (!root) return;

  const icon = root.querySelector('.step-icon');
  const status = root.querySelector('.step-status');
  const desc = root.querySelector('.step-desc');
  const bar  = root.querySelector('.step-bar');

  // reset classes
  root.classList.remove('opacity-60','border-primary/50','bg-primary/5','dark:bg-primary/10',
                        'border-status-ok/50','bg-status-ok/5',
                        'border-status-error/50','bg-status-error/5');
  icon.classList.remove('bg-status-running/20','text-status-running','bg-status-ok/20','text-status-ok','bg-status-error/20','text-status-error');
  status.classList.remove('bg-status-running/20','text-status-running','bg-status-ok/20','text-status-ok','bg-status-error/20','text-status-error');
  bar.classList.remove('bg-status-running','bg-status-ok','bg-status-error','progress-pulse');

  if (newDesc) desc.textContent = newDesc;

  if (state === 'pending') {
    root.classList.add('opacity-60');
    status.textContent = 'Pendiente';
    bar.style.width = '0%';
  }

  if (state === 'running') {
    root.classList.add('opacity-100','border-primary/50','bg-primary/5','dark:bg-primary/10');
    icon.classList.add('bg-status-running/20','text-status-running');
    status.classList.add('bg-status-running/20','text-status-running');
    status.textContent = 'Ejecutando';
    bar.classList.add('bg-status-running','progress-pulse');
    bar.style.width = '100%';
  }

  if (state === 'success') {
    root.classList.add('opacity-100','border-status-ok/50','bg-status-ok/5');
    icon.classList.add('bg-status-ok/20','text-status-ok');
    status.classList.add('bg-status-ok/20','text-status-ok');
    status.textContent = durationMs ? `OK • ${(durationMs/1000).toFixed(2)}s` : 'OK';
    bar.classList.add('bg-status-ok');
    bar.style.width = '100%';
  }

  if (state === 'error') {
    root.classList.add('opacity-100','border-status-error/50','bg-status-error/5');
    icon.classList.add('bg-status-error/20','text-status-error');
    status.classList.add('bg-status-error/20','text-status-error');
    status.textContent = durationMs ? `Error • ${(durationMs/1000).toFixed(2)}s` : 'Error';
    bar.classList.add('bg-status-error');
    bar.style.width = '100%';
  }
}

function addEvent(message, type='info', ms=0) {
  events.push({ id: Date.now()+Math.random(), t: new Date(), msg: message, type, ms });
  renderTimeline();
}

function renderTimeline() {
  if (!el.timeline) return;
  
  if (!events.length) {
    el.timeline.innerHTML = `
      <li class="text-center py-8 text-gray-600 dark:text-gray-300">
        <span class="material-symbols-outlined text-4xl mb-2 opacity-50">timeline</span>
        <p>Los eventos aparecerán aquí durante la ejecución del proceso</p>
      </li>`;
    return;
  }

  el.timeline.innerHTML = events.map((e,i) => `
    <li>
      <div class="relative pb-8">
        ${i !== events.length-1 ? '<span aria-hidden="true" class="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"></span>' : ''}
        <div class="relative flex items-start space-x-3">
          <div>
            <div class="relative px-1">
              <div class="h-8 w-8 rounded-full ring-8 ring-background-light dark:ring-background-dark flex items-center justify-center
                          ${e.type==='success'?'bg-status-ok/20':e.type==='error'?'bg-status-error/20':'bg-primary/20'}">
                <span class="material-symbols-outlined text-lg
                            ${e.type==='success'?'text-status-ok':e.type==='error'?'text-status-error':'text-primary'}">
                  ${e.type==='success'?'check_circle':e.type==='error'?'error':'info'}
                </span>
              </div>
            </div>
          </div>
          <div class="min-w-0 flex-1 py-1.5">
            <div class="text-sm text-gray-700 dark:text-gray-300">
              <span class="font-medium text-gray-900 dark:text-white">${e.msg}</span>
              <span class="whitespace-nowrap"> at ${e.t.toLocaleTimeString()}</span>
              ${e.ms?`<span class="ml-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium 
                     ${e.type==='success'?'bg-status-ok/20 text-status-ok':e.type==='error'?'bg-status-error/20 text-status-error':'bg-primary/20 text-primary'}">
                      ${(e.ms/1000).toFixed(2)}s
                     </span>`:''}
            </div>
          </div>
        </div>
      </div>
    </li>
  `).join('');
}

function renderVars() {
  if (el.varsPre) {
    el.varsPre.textContent = Object.keys(vars).length ? JSON.stringify(vars, null, 2)
                                                      : '{\n  // Las variables aparecerán aquí durante la ejecución\n}';
  }
}

function setStatus(s) {
  // Verificar que los elementos existan
  if (!el.statusText || !el.statusDot || !el.statusPing) {
    return;
  }
  
  // remove old colors
  el.statusText.classList.remove('text-status-info','text-status-ok','text-status-running','text-status-error');
  el.statusDot.classList.remove('bg-status-info','bg-status-ok','bg-status-running','bg-status-error');
  el.statusPing.classList.remove('bg-status-info','bg-status-ok','bg-status-running','bg-status-error');

  if (s==='ready') {
    el.statusText.textContent = 'Listo';
    el.statusText.classList.add('text-status-info');
    el.statusDot.classList.add('bg-status-info');
    el.statusPing.classList.add('bg-status-info');
  }
  if (s==='running') {
    el.statusText.textContent = 'Ejecutando';
    el.statusText.classList.add('text-status-running');
    el.statusDot.classList.add('bg-status-running');
    el.statusPing.classList.add('bg-status-running');
  }
  if (s==='success') {
    el.statusText.textContent = 'Finalizado';
    el.statusText.classList.add('text-status-ok');
    el.statusDot.classList.add('bg-status-ok');
    el.statusPing.classList.add('bg-status-ok');
  }
  if (s==='error') {
    el.statusText.textContent = 'Error';
    el.statusText.classList.add('text-status-error');
    el.statusDot.classList.add('bg-status-error');
    el.statusPing.classList.add('bg-status-error');
  }
}

function setButtons(disabled) {
  [el.btnHappy, el.btnReject, el.btnStock].forEach(b => b.disabled = disabled);
}

// ---------- Servicios (invocaciones simuladas) ----------
function wait(ms) {
  return new Promise(res => setTimeout(res, ms / speedFactor));
}

async function paymentAuthorize(order) {
  const start = performance.now();
  // Retraso entre 400..900 ms (escalado)
  await wait(400 + Math.random()*500);
  const approved = order.amount <= 200;
  const result = {
    approved,
    authId: approved ? `AUTH_${Date.now()}` : null,
    reason: approved ? 'Pago aprobado' : 'Pago rechazado (> límite)'
  };
  return { result, ms: performance.now() - start };
}

async function inventoryReserve(order) {
  const start = performance.now();
  await wait(300 + Math.random()*500);
  const reserved = !order.orderId.endsWith('7');
  const result = {
    reserved,
    reservationId: reserved ? `RES_${Date.now()}` : null,
    reason: reserved ? 'Inventario reservado' : 'Sin stock'
  };
  return { result, ms: performance.now() - start };
}

// Compensación para pago (efecto de deshacer)
async function paymentRefund(auth) {
  const start = performance.now();
  await wait(250 + Math.random()*300);
  const result = { refunded: !!auth?.authId, refundId: `REF_${Date.now()}` };
  return { result, ms: performance.now() - start };
}

// ---------- Orquestación (estilo BPEL) ----------
async function run(mode) {
  if (currentScenario) return;

  currentScenario = mode;
  processStart = performance.now();
  executedSteps = 0;
  vars = {};
  events = [];
  renderTimeline();
  renderVars();
  setButtons(true);
  setStatus('running');

  // Reset steps to pending
  STEPS.forEach(s => setStepState(s.id, 'pending'));

  // Keep runtime ticking
  cancelAnimationFrame(runtimeRAF);
  const tick = () => {
    const ms = performance.now() - processStart;
    updateKPIs(ms);
    runtimeRAF = requestAnimationFrame(tick);
  };
  runtimeRAF = requestAnimationFrame(tick);

  try {
    // Scenario → order (also serves as correlation key)
    const order =
      mode === 'reject' ? { orderId:'A-1002', amount:250, customerId:'C-456' } :
      mode === 'nostock' ? { orderId:'A-1007', amount:125, customerId:'C-789' } :
                           { orderId:'A-1001', amount:125, customerId:'C-123' };

    // Paso 1 — Recibir (BPEL receive)
    const t1 = performance.now();
    setStepState('receive','running','Procesando solicitud entrante…');
    addEvent('Solicitud recibida', 'info');
    await wait(120);
    vars.order = order;
    setStepState('receive','success', 'Solicitud procesada', performance.now()-t1);
    addEvent('Solicitud procesada', 'success', performance.now()-t1);
    executedSteps++;

    // Paso 2 — Autorizar Pago (BPEL invoke)
    const t2 = performance.now();
    setStepState('payment','running','Contactando proveedor de pago…');
    addEvent('Autorización de pago iniciada', 'info');
    const { result: auth, ms: msAuth } = await paymentAuthorize(order);
    vars.auth = auth;
    if (auth.approved) {
      setStepState('payment','success','Pago autorizado', msAuth);
      addEvent('Pago autorizado', 'success', msAuth);
    } else {
      setStepState('payment','error','Pago rechazado', msAuth);
      addEvent(`Pago rechazado: ${auth.reason}`, 'error', msAuth);
    }
    executedSteps++;

    // Paso 3 — Decisión (BPEL if)
    const t3 = performance.now();
    setStepState('decision','running','Evaluando resultado del pago…');
    await wait(80);
    if (!auth.approved) {
      setStepState('decision','success','Pago no aprobado → omitir reserva', performance.now()-t3);
      addEvent('Decisión: ruta de rechazo', 'error', performance.now()-t3);

      // Paso 5 — Responder (rechazo) (BPEL reply)
      const t5r = performance.now();
      setStepState('reply','running','Enviando rechazo…');
      await wait(180);
      vars.reply = { status:'rejected', message:'Orden rechazada - pago fallido', ts:new Date().toISOString() };
      setStepState('reply','success','Rechazo enviado', performance.now()-t5r);
      addEvent('Rechazo de orden enviado', 'success', performance.now()-t5r);
      executedSteps++;

      finish(true);
      return;
    } else {
      setStepState('decision','success','Pago aprobado → continuar', performance.now()-t3);
      addEvent('Decisión: ruta aprobada', 'success', performance.now()-t3);
      executedSteps++;
    }

    // Paso 4 — Reservar Inventario (BPEL invoke)
    const t4 = performance.now();
    setStepState('inventory','running','Verificando inventario…');
    addEvent('Reserva de inventario iniciada', 'info');
    const { result: inv, ms: msInv } = await inventoryReserve(order);
    vars.inventory = inv;

    if (inv.reserved) {
      setStepState('inventory','success','Inventario reservado', msInv);
      addEvent('Inventario reservado', 'success', msInv);
      executedSteps++;

      // Paso 5 — Responder (confirmar)
      const t5 = performance.now();
      setStepState('reply','running','Enviando confirmación…');
      await wait(180);
      vars.reply = { status:'confirmed', message:'Orden confirmada', ts:new Date().toISOString() };
      setStepState('reply','success','Confirmación enviada', performance.now()-t5);
      addEvent('Confirmación de orden enviada', 'success', performance.now()-t5);
      executedSteps++;

      finish(true);
      return;
    } else {
      setStepState('inventory','error','Inventario no disponible', msInv);
      addEvent(`Inventario falló: ${inv.reason}`, 'error', msInv);
      executedSteps++;

      // *** COMPENSACIÓN *** (BPEL compensation handler)
      // Pago exitoso pero inventario falló → reembolso
      const tC = performance.now();
      setStepState('refund','running','Compensando: reembolsando pago…');
      addEvent('Compensación iniciada (reembolso)', 'info');
      const { result: comp, ms: msComp } = await paymentRefund(vars.auth);
      vars.compensation = comp;
      setStepState('refund', comp.refunded ? 'success' : 'error',
        comp.refunded ? 'Reembolso completo' : 'Reembolso falló', msComp);
      addEvent(comp.refunded ? 'Reembolso completo' : 'Reembolso falló',
               comp.refunded ? 'success' : 'error', msComp);
      executedSteps++;

      // Paso 5 — Responder (rechazar)
      const t5b = performance.now();
      setStepState('reply','running','Enviando rechazo…');
      await wait(160);
      vars.reply = { status:'rejected', message:'Orden rechazada - sin inventario (pago reembolsado)', ts:new Date().toISOString() };
      setStepState('reply','success','Rechazo enviado', performance.now()-t5b);
      addEvent('Rechazo de orden enviado', 'success', performance.now()-t5b);
      executedSteps++;

      finish(true);
      return;
    }

  } catch (e) {
    console.error(e);
    addEvent(`Proceso falló: ${e.message||e}`, 'error');
    setStatus('error');
  } finally {
    // detener ticker de tiempo de ejecución en finish()
  }
}

function finish(ok) {
  cancelAnimationFrame(runtimeRAF);
  const totalMs = performance.now() - processStart;
  updateKPIs(totalMs);
  addEvent('Proceso completado', ok?'success':'error', totalMs);
  setStatus(ok ? 'success' : 'error');
  setButtons(false);
  renderVars(); // estado final
  currentScenario = null;
}

// ---------- KPIs ----------
function updateKPIs(ms) {
  if (el.kpiRuntime) el.kpiRuntime.textContent = `${(ms/1000).toFixed(1)}s`;
  if (el.kpiSteps) el.kpiSteps.textContent = String(executedSteps);
  if (el.kpiRetries) el.kpiRetries.textContent = '0';
  renderVars();
}

// ---------- Funciones del Código BPEL ----------
function copyBPELCode() {
  const bpelCode = `<?xml version="1.0" encoding="UTF-8"?>
<process name="OrderProcessing" 
         targetNamespace="http://ejemplo.com/orderprocess" 
         xmlns="http://docs.oasis-open.org/wsbpel/2.0/process/executable"
         xmlns:tns="http://ejemplo.com/orderprocess"
         xmlns:client="http://cliente.ejemplo.com">

  <!-- Variables para mantener el estado del proceso -->
  <variables>
    <variable name="orderRequest" messageType="client:OrderRequest"/>
    <variable name="paymentResponse" messageType="client:PaymentResponse"/>
    <variable name="inventoryResponse" messageType="client:InventoryResponse"/>
    <variable name="orderResponse" messageType="client:OrderResponse"/>
  </variables>

  <!-- Secuencia principal del proceso -->
  <sequence>
    <!-- 1. Recibir solicitud del cliente -->
    <receive name="ReceiveOrder" 
             partnerLink="ClientLink" 
             operation="processOrder" 
             variable="orderRequest"/>

    <!-- 2. Autorizar pago -->
    <invoke name="AuthorizePayment" 
            partnerLink="PaymentLink" 
            operation="authorizePayment" 
            inputVariable="orderRequest" 
            outputVariable="paymentResponse"/>

    <!-- 3. Decisión basada en resultado del pago -->
    <if name="CheckPaymentApproval">
      <condition>$paymentResponse.approved = 'true'</condition>
      
      <!-- Pago aprobado: continuar con inventario -->
      <sequence>
        <!-- 4. Reservar inventario -->
        <invoke name="ReserveInventory" 
                partnerLink="InventoryLink" 
                operation="reserveItems" 
                inputVariable="orderRequest" 
                outputVariable="inventoryResponse"/>

        <!-- Verificar disponibilidad de inventario -->
        <if name="CheckInventoryAvailability">
          <condition>$inventoryResponse.available = 'true'</condition>
          
          <!-- Inventario disponible: confirmar orden -->
          <assign name="SetConfirmationResponse">
            <copy>
              <from literal="confirmed"/>
              <to>$orderResponse.status</to>
            </copy>
            <copy>
              <from literal="Orden confirmada exitosamente"/>
              <to>$orderResponse.message</to>
            </copy>
          </assign>
          
          <!-- Inventario no disponible: compensar pago -->
          <else>
            <compensationHandler>
              <invoke name="RefundPayment" 
                      partnerLink="PaymentLink" 
                      operation="refundPayment" 
                      inputVariable="paymentResponse"/>
            </compensationHandler>
            
            <assign name="SetRejectionResponse">
              <copy>
                <from literal="rejected"/>
                <to>$orderResponse.status</to>
              </copy>
              <copy>
                <from literal="Orden rechazada - sin inventario (pago reembolsado)"/>
                <to>$orderResponse.message</to>
              </copy>
            </assign>
          </else>
        </if>
      </sequence>
      
      <!-- Pago rechazado: rechazar orden -->
      <else>
        <assign name="SetPaymentRejectionResponse">
          <copy>
            <from literal="rejected"/>
            <to>$orderResponse.status</to>
          </copy>
          <copy>
            <from literal="Orden rechazada - pago fallido"/>
            <to>$orderResponse.message</to>
          </copy>
        </assign>
      </else>
    </if>

    <!-- 5. Enviar respuesta final al cliente -->
    <reply name="SendResponse" 
           partnerLink="ClientLink" 
           operation="processOrder" 
           variable="orderResponse"/>
  </sequence>
</process>`;

  navigator.clipboard.writeText(bpelCode).then(() => {
    // Cambiar el texto del botón temporalmente
    const copyBtn = document.querySelector('[onclick="copyBPELCode()"]');
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<span class="material-symbols-outlined text-base mr-1">check</span> ¡Copiado!';
    copyBtn.classList.add('bg-green-600', 'hover:bg-green-700');
    copyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
      copyBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    }, 2000);
  }).catch(err => {
    console.error('Error al copiar código BPEL:', err);
    alert('Error al copiar el código al portapapeles');
  });
}

function downloadBPEL() {
  const bpelCode = `<?xml version="1.0" encoding="UTF-8"?>
<process name="OrderProcessing" 
         targetNamespace="http://ejemplo.com/orderprocess" 
         xmlns="http://docs.oasis-open.org/wsbpel/2.0/process/executable"
         xmlns:tns="http://ejemplo.com/orderprocess"
         xmlns:client="http://cliente.ejemplo.com">

  <!-- Variables para mantener el estado del proceso -->
  <variables>
    <variable name="orderRequest" messageType="client:OrderRequest"/>
    <variable name="paymentResponse" messageType="client:PaymentResponse"/>
    <variable name="inventoryResponse" messageType="client:InventoryResponse"/>
    <variable name="orderResponse" messageType="client:OrderResponse"/>
  </variables>

  <!-- Secuencia principal del proceso -->
  <sequence>
    <!-- 1. Recibir solicitud del cliente -->
    <receive name="ReceiveOrder" 
             partnerLink="ClientLink" 
             operation="processOrder" 
             variable="orderRequest"/>

    <!-- 2. Autorizar pago -->
    <invoke name="AuthorizePayment" 
            partnerLink="PaymentLink" 
            operation="authorizePayment" 
            inputVariable="orderRequest" 
            outputVariable="paymentResponse"/>

    <!-- 3. Decisión basada en resultado del pago -->
    <if name="CheckPaymentApproval">
      <condition>$paymentResponse.approved = 'true'</condition>
      
      <!-- Pago aprobado: continuar con inventario -->
      <sequence>
        <!-- 4. Reservar inventario -->
        <invoke name="ReserveInventory" 
                partnerLink="InventoryLink" 
                operation="reserveItems" 
                inputVariable="orderRequest" 
                outputVariable="inventoryResponse"/>

        <!-- Verificar disponibilidad de inventario -->
        <if name="CheckInventoryAvailability">
          <condition>$inventoryResponse.available = 'true'</condition>
          
          <!-- Inventario disponible: confirmar orden -->
          <assign name="SetConfirmationResponse">
            <copy>
              <from literal="confirmed"/>
              <to>$orderResponse.status</to>
            </copy>
            <copy>
              <from literal="Orden confirmada exitosamente"/>
              <to>$orderResponse.message</to>
            </copy>
          </assign>
          
          <!-- Inventario no disponible: compensar pago -->
          <else>
            <compensationHandler>
              <invoke name="RefundPayment" 
                      partnerLink="PaymentLink" 
                      operation="refundPayment" 
                      inputVariable="paymentResponse"/>
            </compensationHandler>
            
            <assign name="SetRejectionResponse">
              <copy>
                <from literal="rejected"/>
                <to>$orderResponse.status</to>
              </copy>
              <copy>
                <from literal="Orden rechazada - sin inventario (pago reembolsado)"/>
                <to>$orderResponse.message</to>
              </copy>
            </assign>
          </else>
        </if>
      </sequence>
      
      <!-- Pago rechazado: rechazar orden -->
      <else>
        <assign name="SetPaymentRejectionResponse">
          <copy>
            <from literal="rejected"/>
            <to>$orderResponse.status</to>
          </copy>
          <copy>
            <from literal="Orden rechazada - pago fallido"/>
            <to>$orderResponse.message</to>
          </copy>
        </assign>
      </else>
    </if>

    <!-- 5. Enviar respuesta final al cliente -->
    <reply name="SendResponse" 
           partnerLink="ClientLink" 
           operation="processOrder" 
           variable="orderResponse"/>
  </sequence>
</process>`;

  // Crear elemento de descarga
  const blob = new Blob([bpelCode], { type: 'application/xml' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'OrderProcessing.bpel';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  // Feedback visual para el botón de descarga
  const downloadBtn = document.querySelector('[onclick="downloadBPEL()"]');
  const originalText = downloadBtn.innerHTML;
  downloadBtn.innerHTML = '<span class="material-symbols-outlined text-base mr-1">download_done</span> ¡Descargado!';
  downloadBtn.classList.add('bg-green-600', 'hover:bg-green-700');
  downloadBtn.classList.remove('bg-gray-600', 'hover:bg-gray-700');
  
  setTimeout(() => {
    downloadBtn.innerHTML = originalText;
    downloadBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    downloadBtn.classList.add('bg-gray-600', 'hover:bg-gray-700');
  }, 2000);
}

// ---------- Actividades Interactivas ----------

// Datos de las actividades por equipo
const TEAM_ACTIVITIES = {
  1: {
    name: 'Fundamentos BPEL',
    wordsearch: {
      words: ['RECEIVE', 'INVOKE', 'REPLY', 'ASSIGN', 'VARIABLE', 'SEQUENCE', 'PAYMENTRESULT', 'ORDERRESPONSE'],
      size: 24
    },
    dragdrop: {
      title: 'Completar Código de Proceso de Pedido',
      code: `<____ name="ReceiveOrder"
      partnerLink="client"
      operation="processOrder"
      variable="orderRequest" />

<____ name="AuthorizePayment"
        partnerLink="paymentService"
        operation="authorize"
        inputVariable="orderRequest"
        outputVariable="____" />

<____ name="UpdateInventory"
        partnerLink="inventoryService"
        operation="reserve"
        inputVariable="orderRequest"
        outputVariable="inventoryStatus" />

<____ name="RespondToClient"
      partnerLink="client"
      operation="processOrder"
      variable="____" />`,
      blanks: [
        { position: 0, correct: 'RECEIVE', hint: 'Actividad para recibir mensajes de entrada' },
        { position: 1, correct: 'INVOKE', hint: 'Actividad para llamar servicios externos' },
        { position: 2, correct: 'PAYMENTRESULT', hint: 'Variable que almacena el resultado del pago' },
        { position: 3, correct: 'INVOKE', hint: 'Actividad para llamar servicios externos' },
        { position: 4, correct: 'REPLY', hint: 'Actividad para enviar respuestas al cliente' },
        { position: 5, correct: 'ORDERRESPONSE', hint: 'Variable con la respuesta final del pedido' }
      ]
    }
  },
  2: {
    name: 'Control de Flujo',
    wordsearch: {
      words: ['IF', 'CONDITION', 'FLOW', 'WHILE', 'PICK', 'SCOPE', 'CREDITCHECK', 'APPROVED', 'PARALLEL'],
      size: 24
    },
    dragdrop: {
      title: 'Completar Lógica de Control de Flujo',
      code: `<____ name="CheckCredit">
  <____ test="$orderAmount > 1000">
    <____ name="CreditVerification"
            partnerLink="creditService"
            operation="verify"
            inputVariable="____"
            outputVariable="creditResult" />
  </if>
</if>

<____ name="ParallelProcessing">
  <____ name="ProcessPayment"
          partnerLink="paymentService"
          operation="process" />
  
  <sequence name="ProcessInventory">
    <invoke name="ReserveItems" />
  </sequence>
</flow>`,
      blanks: [
        { position: 0, correct: 'IF', hint: 'Estructura condicional para tomar decisiones' },
        { position: 1, correct: 'CONDITION', hint: 'Expresión que evalúa verdadero o falso' },
        { position: 2, correct: 'INVOKE', hint: 'Actividad para llamar servicios externos' },
        { position: 3, correct: 'CREDITCHECK', hint: 'Variable con datos para verificar crédito' },
        { position: 4, correct: 'FLOW', hint: 'Actividad que permite ejecución paralela' },
        { position: 5, correct: 'INVOKE', hint: 'Actividad que ejecuta una operación de servicio' }
      ]
    }
  },
  3: {
    name: 'Servicios y Datos',
    wordsearch: {
      words: ['ASSIGN', 'COPY', 'FROM', 'TO', 'VARIABLE', 'PARTNER', 'ORDERDATA', 'CUSTOMERINFO', 'TOTALAMOUNT'],
      size: 24
    },
    dragdrop: {
      title: 'Completar Asignación de Datos',
      code: `<____ name="PrepareOrderData">
  <____ name="ExtractCustomerInfo">
    <____ ____="$customerInfo.name" to="$order.customerName" />
    <copy from="$customerInfo.address" ____="$order.deliveryAddress" />
  </copy>
  
  <copy name="CalculateTotal">
    <from expressionLanguage="urn:oasis:names:tc:wsbpel:2.0:sublang:xpath1.0">
      $orderItems.quantity * $orderItems.price
    </from>
    <to ____="$____" />
  </copy>
</assign>`,
      blanks: [
        { position: 0, correct: 'ASSIGN', hint: 'Actividad para manipular y copiar datos' },
        { position: 1, correct: 'COPY', hint: 'Elemento que transfiere datos entre variables' },
        { position: 2, correct: 'FROM', hint: 'Especifica el origen de los datos' },
        { position: 3, correct: 'TO', hint: 'Especifica el destino de los datos' },
        { position: 4, correct: 'VARIABLE', hint: 'Atributo que identifica una variable' },
        { position: 5, correct: 'TOTALAMOUNT', hint: 'Variable que almacena el monto total calculado' }
      ]
    }
  },
  4: {
    name: 'Manejo de Excepciones',
    wordsearch: {
      words: ['SCOPE', 'CATCH', 'FAULT', 'THROW', 'HANDLER', 'COMPENSATE', 'PAYMENTFAULT', 'TIMEOUT', 'ROLLBACK'],
      size: 24
    },
    dragdrop: {
      title: 'Completar Manejo de Errores',
      code: `<____ name="PaymentProcessing">
  <invoke name="ProcessPayment"
          partnerLink="paymentService"
          operation="charge" />
          
  <faultHandlers>
    <____ faultName="____">
      <____ faultName="ProcessingError"
              faultVariable="errorData" />
      <____ name="RefundPayment"
              for="ProcessPayment" />
    </catch>
  </faultHandlers>
  
  <compensationHandler>
    <____ target="ProcessPayment" />
  </compensationHandler>
</scope>`,
      blanks: [
        { position: 0, correct: 'SCOPE', hint: 'Contenedor que agrupa actividades y maneja errores' },
        { position: 1, correct: 'CATCH', hint: 'Captura y maneja excepciones específicas' },
        { position: 2, correct: 'PAYMENTFAULT', hint: 'Tipo de falla relacionada con pagos' },
        { position: 3, correct: 'THROW', hint: 'Lanza una excepción explícitamente' },
        { position: 4, correct: 'COMPENSATE', hint: 'Actividad de compensación para deshacer cambios' },
        { position: 5, correct: 'COMPENSATE', hint: 'Deshace los efectos de una actividad previa' }
      ]
    }
  },
  5: {
    name: 'Historia y Estándares',
    wordsearch: {
      words: ['PROCESS', 'XMLNS', 'TARGETNAMESPACE', 'IMPORT', 'WSDL', 'SCHEMA', 'NAMESPACE', 'VERSION'],
      size: 24
    },
    dragdrop: {
      title: 'Completar Definición de Proceso',
      code: `<____ name="OrderProcess"
       ____="http://example.com/orderprocess"
       xmlns="http://docs.oasis-open.org/wsbpel/2.0/process/executable"
       ____:tns="http://example.com/orderprocess"
       xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/">

  <____ location="OrderService.____"
          ____="http://example.com/orderservice"
          importType="http://schemas.xmlsoap.org/wsdl/" />

  <partnerLinks>
    <partnerLink name="client"
                 partnerLinkType="tns:OrderServiceLT" />
  </partnerLinks>
</process>`,
      blanks: [
        { position: 0, correct: 'PROCESS', hint: 'Elemento raíz que define un proceso BPEL' },
        { position: 1, correct: 'TARGETNAMESPACE', hint: 'Espacio de nombres objetivo del proceso' },
        { position: 2, correct: 'XMLNS', hint: 'Declaración de espacio de nombres XML' },
        { position: 3, correct: 'IMPORT', hint: 'Elemento para importar recursos externos' },
        { position: 4, correct: 'WSDL', hint: 'Extensión de archivo para servicios web' },
        { position: 5, correct: 'NAMESPACE', hint: 'Espacio de nombres del recurso importado' }
      ]
    }
  },
  6: {
    name: 'Ejecución y Motor',
    wordsearch: {
      words: ['VARIABLES', 'VARIABLE', 'MESSAGETYPE', 'ELEMENT', 'TYPE', 'CORRELATIONSET', 'PROPERTY', 'ALIAS'],
      size: 24
    },
    dragdrop: {
      title: 'Completar Definición de Variables',
      code: `<____>
  <____ name="orderRequest"
          ____="tns:OrderMessage" />
  
  <variable name="paymentResult"
            ____="xsd:string" />
            
  <____ name="customerData"
          ____="tns:CustomerInfo" />
          
  <variable name="orderStatus"
            type="____:boolean" />
</variables>

<correlationSets>
  <correlationSet name="orderCorrelation"
                  properties="tns:orderID" />
</correlationSets>`,
      blanks: [
        { position: 0, correct: 'VARIABLES', hint: 'Contenedor para todas las variables del proceso' },
        { position: 1, correct: 'VARIABLE', hint: 'Elemento que define una variable individual' },
        { position: 2, correct: 'MESSAGETYPE', hint: 'Tipo basado en un mensaje WSDL' },
        { position: 3, correct: 'TYPE', hint: 'Atributo que especifica el tipo de datos' },
        { position: 4, correct: 'VARIABLE', hint: 'Definición de variable para datos del cliente' },
        { position: 5, correct: 'ELEMENT', hint: 'Tipo basado en un elemento de esquema XML' },
        { position: 6, correct: 'TYPE', hint: 'Prefijo del espacio de nombres para tipos XSD' }
      ]
    }
  },
  7: {
    name: 'Arquitectura SOA',
    wordsearch: {
      words: ['PARTNERLINKS', 'PARTNERLINK', 'PORTTYPE', 'ROLE', 'SERVICE', 'ENDPOINT', 'BINDING', 'OPERATION'],
      size: 24
    },
    dragdrop: {
      title: 'Completar Partner Links',
      code: `<____>
  <____ name="clientService"
              partnerLinkType="tns:ClientServiceLT"
              myRole="orderProcessor"
              ____="orderService" />
              
  <partnerLink name="paymentService"
               partnerLinkType="tns:PaymentServiceLT"
               ____="paymentProvider" />
               
  <____ name="inventoryService"
              partnerLinkType="tns:InventoryServiceLT"
              partnerRole="inventoryManager" />
</partnerLinks>

<sequence>
  <receive partnerLink="clientService"
           ____="processOrder"
           variable="orderRequest" />
</sequence>`,
      blanks: [
        { position: 0, correct: 'PARTNERLINKS', hint: 'Contenedor para todas las conexiones de servicios' },
        { position: 1, correct: 'PARTNERLINK', hint: 'Define una conexión con un servicio externo' },
        { position: 2, correct: 'PARTNERROLLE', hint: 'Rol que desempeña el servicio asociado' },
        { position: 3, correct: 'PARTNERROLLE', hint: 'Rol del servicio de pago en la interacción' },
        { position: 4, correct: 'PARTNERLINK', hint: 'Conexión con el servicio de inventario' },
        { position: 5, correct: 'OPERATION', hint: 'Operación específica a ejecutar en el servicio' }
      ]
    }
  }
};

// Estado de las actividades
let currentTeam = 1;
let gameStates = {
  1: { wordsearchFound: new Set(), dragdropCorrect: new Set(), wordsearchSelection: [] },
  2: { wordsearchFound: new Set(), dragdropCorrect: new Set(), wordsearchSelection: [] },
  3: { wordsearchFound: new Set(), dragdropCorrect: new Set(), wordsearchSelection: [] },
  4: { wordsearchFound: new Set(), dragdropCorrect: new Set(), wordsearchSelection: [] },
  5: { wordsearchFound: new Set(), dragdropCorrect: new Set(), wordsearchSelection: [] },
  6: { wordsearchFound: new Set(), dragdropCorrect: new Set(), wordsearchSelection: [] },
  7: { wordsearchFound: new Set(), dragdropCorrect: new Set(), wordsearchSelection: [] }
};

// Inicializar actividades interactivas
function initInteractiveActivities() {
  // Verificar que los elementos existan
  if (!document.getElementById('team-activities')) {
    return;
  }

  // Event listeners para botones de equipos
  document.querySelectorAll('.team-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const teamNum = parseInt(e.target.id.split('-')[1]);
      switchTeam(teamNum);
    });
  });

  // Event listener para cerrar modal
  const closeModal = document.getElementById('close-modal');
  if (closeModal) {
    closeModal.addEventListener('click', () => {
      document.getElementById('completion-modal').classList.add('hidden');
    });
  }

  // Generar actividades para todos los equipos
  for (let team = 1; team <= 7; team++) {
    initGameState(team);
    generateWordsearch(team);
    generateDragDrop(team);
  }
  
  // Inicializar la calificación para el equipo activo
  updateCurrentGrade(currentTeam);
}

// Cambiar de equipo
function switchTeam(teamNum) {
  currentTeam = teamNum;
  
  // Actualizar botones
  document.querySelectorAll('.team-btn').forEach(btn => {
    btn.classList.remove('bg-primary', 'text-white');
    btn.classList.add('text-gray-700', 'dark:text-gray-300', 'hover:bg-gray-200', 'dark:hover:bg-gray-700');
  });
  
  const activeBtn = document.getElementById(`team-${teamNum}-btn`);
  activeBtn.classList.add('bg-primary', 'text-white');
  activeBtn.classList.remove('text-gray-700', 'dark:text-gray-300', 'hover:bg-gray-200', 'dark:hover:bg-gray-700');
  
  // Mostrar contenido del equipo
  document.querySelectorAll('.team-content').forEach(content => {
    content.classList.add('hidden');
  });
  document.getElementById(`team-${teamNum}-content`).classList.remove('hidden');
  
  // Actualizar calificación para el equipo seleccionado
  updateCurrentGrade(teamNum);
}

// Generar sopa de letras
function generateWordsearch(teamNum) {
  try {
    const activity = TEAM_ACTIVITIES[teamNum];
    if (!activity || !activity.wordsearch) {
      console.error(`No wordsearch data for team ${teamNum}`);
      return;
    }
    
    const { words, size } = activity.wordsearch;
    
    // Crear grid vacío
    const grid = Array(size).fill().map(() => Array(size).fill(''));
    const placedWords = [];
    
    // Colocar palabras
    words.forEach(word => {
      let placed = false;
      let attempts = 0;
      
      while (!placed && attempts < 100) {
        const direction = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        const row = Math.floor(Math.random() * size);
        const col = Math.floor(Math.random() * size);
        
        if (canPlaceWord(grid, word, row, col, direction, size)) {
          placeWord(grid, word, row, col, direction);
          placedWords.push({ word, row, col, direction });
          placed = true;
        }
        attempts++;
      }
      
      if (!placed) {
        console.warn(`Could not place word ${word} for team ${teamNum}`);
      }
    });
  
    // Rellenar espacios vacíos con letras aleatorias
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (grid[i][j] === '') {
          grid[i][j] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        }
      }
    }
    
    // Renderizar grid
    const gridElement = document.getElementById(`team-${teamNum}-wordsearch`);
    if (!gridElement) {
      console.error(`Wordsearch grid element not found for team ${teamNum}`);
      return;
    }
    
    gridElement.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    gridElement.innerHTML = '';
    
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const cell = document.createElement('div');
        cell.className = 'wordsearch-cell';
        cell.textContent = grid[i][j];
        cell.dataset.row = i;
        cell.dataset.col = j;
        
        // Eventos de arrastre para selección
        cell.addEventListener('mousedown', (e) => startWordsearchSelection(e, teamNum, i, j));
        cell.addEventListener('mouseover', (e) => continueWordsearchSelection(e, teamNum, i, j));
        cell.addEventListener('mouseup', () => endWordsearchSelection(teamNum));
        
        gridElement.appendChild(cell);
      }
    }
    
    // Prevenir arrastre de texto
    gridElement.addEventListener('selectstart', (e) => e.preventDefault());
    
    // Event listener global para finalizar selección
    document.addEventListener('mouseup', () => {
      if (isDragging && currentDragTeam === teamNum) {
        endWordsearchSelection(teamNum);
      }
    });
    
    // Renderizar lista de palabras
    const wordsElement = document.getElementById(`team-${teamNum}-words`);
    if (wordsElement) {
      wordsElement.innerHTML = words.map(word => 
        `<div class="word-item px-2 py-1 bg-white dark:bg-gray-700 rounded text-gray-800 dark:text-gray-200" data-word="${word}">${word}</div>`
      ).join('');
    }
  
    // Guardar información del grid para validación
    gridElement.dataset.placedWords = JSON.stringify(placedWords);
    gridElement.dataset.grid = JSON.stringify(grid);
    
    console.log(`Wordsearch generated successfully for team ${teamNum}`);
  } catch (error) {
    console.error(`Error generating wordsearch for team ${teamNum}:`, error);
  }
}

// Verificar si se puede colocar una palabra
function canPlaceWord(grid, word, row, col, direction, size) {
  if (direction === 'horizontal') {
    if (col + word.length > size) return false;
    for (let i = 0; i < word.length; i++) {
      if (grid[row][col + i] !== '' && grid[row][col + i] !== word[i]) return false;
    }
  } else {
    if (row + word.length > size) return false;
    for (let i = 0; i < word.length; i++) {
      if (grid[row + i][col] !== '' && grid[row + i][col] !== word[i]) return false;
    }
  }
  return true;
}

// Colocar palabra en el grid
function placeWord(grid, word, row, col, direction) {
  if (direction === 'horizontal') {
    for (let i = 0; i < word.length; i++) {
      grid[row][col + i] = word[i];
    }
  } else {
    for (let i = 0; i < word.length; i++) {
      grid[row + i][col] = word[i];
    }
  }
}

// Variables para el arrastre
let isDragging = false;
let dragStartRow = -1;
let dragStartCol = -1;
let currentDragTeam = -1;

// Iniciar selección por arrastre
function startWordsearchSelection(event, teamNum, row, col) {
  event.preventDefault();
  isDragging = true;
  dragStartRow = row;
  dragStartCol = col;
  currentDragTeam = teamNum;
  
  // Limpiar selección anterior
  gameStates[teamNum].wordsearchSelection = [];
  gameStates[teamNum].wordsearchSelection.push(`${row}-${col}`);
  
  updateWordsearchSelection(teamNum);
}

// Continuar selección por arrastre
function continueWordsearchSelection(event, teamNum, row, col) {
  if (!isDragging || teamNum !== currentDragTeam) return;
  
  // Calcular la línea desde el punto inicial hasta el actual
  const selection = getLineSelection(dragStartRow, dragStartCol, row, col);
  gameStates[teamNum].wordsearchSelection = selection;
  
  updateWordsearchSelection(teamNum);
}

// Finalizar selección por arrastre
function endWordsearchSelection(teamNum) {
  if (!isDragging || teamNum !== currentDragTeam) return;
  
  isDragging = false;
  checkWordsearchCompletion(teamNum);
  
  // Reset variables
  dragStartRow = -1;
  dragStartCol = -1;
  currentDragTeam = -1;
}

// Obtener selección en línea recta
function getLineSelection(startRow, startCol, endRow, endCol) {
  const selection = [];
  
  // Calcular dirección
  const deltaRow = endRow - startRow;
  const deltaCol = endCol - startCol;
  
  // Solo permitir líneas rectas (horizontal, vertical, diagonal)
  const steps = Math.max(Math.abs(deltaRow), Math.abs(deltaCol));
  
  if (steps === 0) {
    selection.push(`${startRow}-${startCol}`);
    return selection;
  }
  
  const stepRow = deltaRow === 0 ? 0 : deltaRow / Math.abs(deltaRow);
  const stepCol = deltaCol === 0 ? 0 : deltaCol / Math.abs(deltaCol);
  
  // Solo permitir 8 direcciones válidas
  if (Math.abs(deltaRow) !== 0 && Math.abs(deltaCol) !== 0 && Math.abs(deltaRow) !== Math.abs(deltaCol)) {
    // No es una línea recta válida, solo seleccionar celda inicial
    selection.push(`${startRow}-${startCol}`);
    return selection;
  }
  
  for (let i = 0; i <= steps; i++) {
    const row = startRow + (stepRow * i);
    const col = startCol + (stepCol * i);
    selection.push(`${row}-${col}`);
  }
  
  return selection;
}

// Actualizar selección visual
function updateWordsearchSelection(teamNum) {
  const state = gameStates[teamNum];
  const gridElement = document.getElementById(`team-${teamNum}-wordsearch`);
  
  // Limpiar selecciones anteriores
  gridElement.querySelectorAll('.wordsearch-cell').forEach(cell => {
    cell.classList.remove('selected');
  });
  
  // Aplicar nuevas selecciones
  state.wordsearchSelection.forEach(cellKey => {
    const [row, col] = cellKey.split('-').map(Number);
    const cell = gridElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.classList.add('selected');
  });
}

// Verificar completitud de sopa de letras
function checkWordsearchCompletion(teamNum) {
  const state = gameStates[teamNum];
  const gridElement = document.getElementById(`team-${teamNum}-wordsearch`);
  const placedWords = JSON.parse(gridElement.dataset.placedWords);
  const selection = state.wordsearchSelection;
  
  if (selection.length >= 2) {
    const selectionCoords = selection.map(key => {
      const [row, col] = key.split('-').map(Number);
      return { row, col };
    });
    
    // Verificar si la selección forma una línea recta
    if (isValidSelection(selectionCoords)) {
      const word = getWordFromSelection(teamNum, selectionCoords);
      
      // Verificar si la palabra existe
      placedWords.forEach(placedWord => {
        if (placedWord.word === word && !state.wordsearchFound.has(word)) {
          state.wordsearchFound.add(word);
          markWordAsFound(teamNum, word, selectionCoords);
          state.wordsearchSelection = [];
          updateWordsearchSelection(teamNum);
          updateWordBank(teamNum); // Actualizar banco de palabras
          updateCurrentGrade(teamNum); // Actualizar calificación
          checkActivityCompletion(teamNum);
        }
      });
    }
  }
}

// Verificar si la selección es válida (línea recta)
function isValidSelection(coords) {
  if (coords.length < 2) return false;
  
  const first = coords[0];
  const last = coords[coords.length - 1];
  
  // Horizontal
  if (first.row === last.row) {
    const minCol = Math.min(first.col, last.col);
    const maxCol = Math.max(first.col, last.col);
    return coords.length === maxCol - minCol + 1;
  }
  
  // Vertical
  if (first.col === last.col) {
    const minRow = Math.min(first.row, last.row);
    const maxRow = Math.max(first.row, last.row);
    return coords.length === maxRow - minRow + 1;
  }
  
  // Diagonal
  const rowDiff = Math.abs(last.row - first.row);
  const colDiff = Math.abs(last.col - first.col);
  return rowDiff === colDiff && coords.length === rowDiff + 1;
}

// Obtener palabra de la selección
function getWordFromSelection(teamNum, coords) {
  const gridElement = document.getElementById(`team-${teamNum}-wordsearch`);
  const grid = JSON.parse(gridElement.dataset.grid);
  
  return coords.map(coord => grid[coord.row][coord.col]).join('');
}

// Marcar palabra como encontrada
function markWordAsFound(teamNum, word, coords) {
  const gridElement = document.getElementById(`team-${teamNum}-wordsearch`);
  
  coords.forEach(coord => {
    const cell = gridElement.querySelector(`[data-row="${coord.row}"][data-col="${coord.col}"]`);
    if (cell) cell.classList.add('found');
  });
  
  // Marcar en la lista de palabras
  const wordElement = document.querySelector(`#team-${teamNum}-words [data-word="${word}"]`);
  if (wordElement) wordElement.classList.add('found');
}

// Validar que una palabra esté dentro de los límites
function isWordWithinBounds(word, row, col, direction, size) {
  if (direction === 'across') {
    return col >= 0 && col + word.length <= size && row >= 0 && row < size;
  } else {
    return row >= 0 && row + word.length <= size && col >= 0 && col < size;
  }
}

// Generar drag-and-drop para completar código BPEL (versión moderna)
function generateDragDrop(teamNum) {
  try {
    const activity = TEAM_ACTIVITIES[teamNum];
    if (!activity || !activity.dragdrop) {
      console.error(`No dragdrop data for team ${teamNum}`);
      return;
    }
    
    const gridElement = document.getElementById(`team-${teamNum}-crossword`);
    if (!gridElement) {
      console.error(`Grid element not found for team ${teamNum}`);
      return;
    }
    
    // Limpiar y configurar el contenedor
    gridElement.innerHTML = '';
    gridElement.className = 'w-full';
    
    const { title, code, blanks } = activity.dragdrop;
    
    // Crear contenedor principal
    const mainContainer = document.createElement('div');
    mainContainer.className = 'space-y-6';
    
    // Título del ejercicio
    const titleElement = document.createElement('h4');
    titleElement.className = 'text-xl font-bold text-gray-800 dark:text-gray-200 mb-4';
    titleElement.textContent = title;
    mainContainer.appendChild(titleElement);
    
    // Layout principal: código y banco de palabras
    const layoutContainer = document.createElement('div');
    layoutContainer.className = 'grid lg:grid-cols-3 gap-6';
    
    // Panel izquierdo: Código BPEL (2/3 del ancho)
    const codeSection = document.createElement('div');
    codeSection.className = 'lg:col-span-2';
    
    const codePanel = document.createElement('div');
    codePanel.className = 'bg-gray-900 rounded-lg p-6 overflow-x-auto';
    
    const codeContainer = document.createElement('div');
    codeContainer.className = 'font-mono text-sm leading-relaxed';
    codeContainer.id = `code-container-${teamNum}`;
    
    // Procesar código línea por línea para mejor formato
    const codeLines = code.split('\n');
    let blankIndex = 0;
    
    codeLines.forEach((line, lineIndex) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'flex items-center space-x-2 py-1';
      
      // Número de línea
      const lineNumber = document.createElement('span');
      lineNumber.className = 'text-gray-500 text-xs w-8 flex-shrink-0 text-right select-none';
      lineNumber.textContent = (lineIndex + 1).toString().padStart(2, ' ');
      lineDiv.appendChild(lineNumber);
      
      // Contenido de la línea
      const lineContent = document.createElement('div');
      lineContent.className = 'flex-1 text-green-400';
      
      if (line.includes('____')) {
        // Línea con blank - procesarla especialmente
        const parts = line.split('____');
        parts.forEach((part, partIndex) => {
          if (part) {
            const textSpan = document.createElement('span');
            textSpan.textContent = part;
            lineContent.appendChild(textSpan);
          }
          
          if (partIndex < parts.length - 1 && blankIndex < blanks.length) {
            // Crear drop zone moderno
            const dropZone = document.createElement('div');
            dropZone.className = 'inline-flex items-center justify-center min-w-32 h-8 mx-1 px-3 bg-blue-600 hover:bg-blue-700 border-2 border-dashed border-blue-400 rounded-lg cursor-pointer transition-all duration-200 text-white font-semibold text-xs';
            dropZone.dataset.blankId = blankIndex;
            dropZone.dataset.correct = blanks[blankIndex].correct.toLowerCase();
            dropZone.dataset.team = teamNum;
            dropZone.title = blanks[blankIndex].hint;
            dropZone.textContent = `[${blankIndex + 1}]`;
            
            // Agregar efectos hover y estados
            dropZone.addEventListener('dragover', handleDragOver);
            dropZone.addEventListener('dragleave', handleDragLeave);
            dropZone.addEventListener('drop', (e) => handleDrop(e, teamNum));
            dropZone.addEventListener('click', (e) => handleDropZoneClick(e, teamNum));
            
            lineContent.appendChild(dropZone);
            blankIndex++;
          }
        });
      } else {
        lineContent.textContent = line;
      }
      
      lineDiv.appendChild(lineContent);
      codeContainer.appendChild(lineDiv);
    });
    
    codePanel.appendChild(codeContainer);
    codeSection.appendChild(codePanel);
    layoutContainer.appendChild(codeSection);
    
    // Panel derecho: Banco de palabras y controles (1/3 del ancho)
    const rightPanel = document.createElement('div');
    rightPanel.className = 'space-y-4';
    
    // Banco de palabras
    const wordBankSection = document.createElement('div');
    wordBankSection.innerHTML = `
      <h5 class="font-bold text-lg mb-3 text-gray-800 dark:text-gray-200">Banco de Palabras</h5>
      <div id="word-bank-${teamNum}" class="space-y-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 min-h-40">
        <div class="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          <div class="mb-2">📝</div>
          <p>Completa la búsqueda de palabras para activar el banco</p>
        </div>
      </div>
    `;
    rightPanel.appendChild(wordBankSection);
    
    // Panel de progreso
    const progressSection = document.createElement('div');
    progressSection.innerHTML = `
      <h5 class="font-bold text-lg mb-3 text-gray-800 dark:text-gray-200">Progreso</h5>
      <div class="bg-gray-200 dark:bg-gray-700 rounded-full h-6 mb-3 overflow-hidden">
        <div id="progress-bar-${teamNum}" class="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500 flex items-center justify-center text-white text-xs font-bold" style="width: 0%"></div>
      </div>
      <p id="progress-text-${teamNum}" class="text-sm text-center text-gray-700 dark:text-gray-300 font-medium">0 de ${blanks.length} espacios completados</p>
    `;
    rightPanel.appendChild(progressSection);
    
    // Panel de ayuda
    const helpSection = document.createElement('div');
    helpSection.innerHTML = `
      <h5 class="font-bold text-lg mb-3 text-gray-800 dark:text-gray-200">Ayuda</h5>
      <div class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 p-4 rounded-lg text-sm">
        <ul class="space-y-2 text-gray-700 dark:text-gray-300">
          <li class="flex items-start space-x-2">
            <span class="text-blue-500 font-bold">1.</span>
            <span>Encuentra todas las palabras en la búsqueda</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="text-blue-500 font-bold">2.</span>
            <span>Arrastra palabras a los espacios numerados [1], [2], etc.</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="text-blue-500 font-bold">3.</span>
            <span>Usa las pistas al pasar el cursor sobre los espacios</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="text-blue-500 font-bold">4.</span>
            <span>Haz clic en un espacio para limpiarlo</span>
          </li>
        </ul>
      </div>
    `;
    rightPanel.appendChild(helpSection);
    
    layoutContainer.appendChild(rightPanel);
    mainContainer.appendChild(layoutContainer);
    gridElement.appendChild(mainContainer);
    
    // Verificar palabras encontradas y actualizar banco
    updateWordBank(teamNum);
    
    console.log(`Modern drag-drop generated successfully for team ${teamNum}`);
  } catch (error) {
    console.error(`Error generating drag-drop for team ${teamNum}:`, error);
  }
}

// Manejar drag over (entrada)
function handleDragOver(event) {
  event.preventDefault();
  const dropZone = event.currentTarget;
  dropZone.classList.add('bg-blue-700', 'border-blue-300', 'scale-105', 'shadow-lg');
  dropZone.style.transform = 'scale(1.05)';
}

// Manejar drag leave (salida)
function handleDragLeave(event) {
  const dropZone = event.currentTarget;
  dropZone.classList.remove('bg-blue-700', 'border-blue-300', 'scale-105', 'shadow-lg');
  dropZone.style.transform = '';
}

// Manejar drop (soltar)
function handleDrop(event, teamNum) {
  event.preventDefault();
  const dropZone = event.currentTarget;
  const draggedWord = event.dataTransfer.getData('text/plain');
  
  // Limpiar efectos de hover
  dropZone.classList.remove('bg-blue-700', 'border-blue-300', 'scale-105', 'shadow-lg');
  dropZone.style.transform = '';
  
  if (draggedWord) {
    const correct = dropZone.dataset.correct;
    const blankId = dropZone.dataset.blankId;
    
    // Actualizar contenido
    dropZone.textContent = draggedWord;
    
    // Verificar si es correcto
    if (draggedWord.toLowerCase() === correct.toLowerCase()) {
      // Correcto - estilo verde
      dropZone.className = 'inline-flex items-center justify-center min-w-32 h-8 mx-1 px-3 bg-green-600 hover:bg-green-700 border-2 border-green-400 rounded-lg cursor-pointer transition-all duration-200 text-white font-semibold text-xs shadow-md';
      gameStates[teamNum].dragdropCorrect.add(blankId);
      
      // Efecto de éxito
      dropZone.style.animation = 'pulse 0.6s ease-in-out';
      setTimeout(() => {
        dropZone.style.animation = '';
      }, 600);
    } else {
      // Incorrecto - estilo rojo
      dropZone.className = 'inline-flex items-center justify-center min-w-32 h-8 mx-1 px-3 bg-red-600 hover:bg-red-700 border-2 border-red-400 rounded-lg cursor-pointer transition-all duration-200 text-white font-semibold text-xs shadow-md';
      gameStates[teamNum].dragdropCorrect.delete(blankId);
      
      // Efecto de error (shake)
      dropZone.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => {
        dropZone.style.animation = '';
      }, 500);
    }
    
    // Actualizar progreso
    updateProgress(teamNum);
    updateCurrentGrade(teamNum); // Actualizar calificación
    checkActivityCompletion(teamNum);
  }
}

// Manejar click en drop zone para limpiar
function handleDropZoneClick(event, teamNum) {
  const dropZone = event.currentTarget;
  const blankId = dropZone.dataset.blankId;
  
  // Solo limpiar si tiene contenido
  if (dropZone.textContent !== `[${parseInt(blankId) + 1}]`) {
    // Restaurar estado original
    dropZone.textContent = `[${parseInt(blankId) + 1}]`;
    dropZone.className = 'inline-flex items-center justify-center min-w-32 h-8 mx-1 px-3 bg-blue-600 hover:bg-blue-700 border-2 border-dashed border-blue-400 rounded-lg cursor-pointer transition-all duration-200 text-white font-semibold text-xs';
    
    // Remover de completados
    gameStates[teamNum].dragdropCorrect.delete(blankId);
    
    // Actualizar progreso
    updateProgress(teamNum);
    updateCurrentGrade(teamNum); // Actualizar calificación
    
    // Efecto visual de limpieza
    dropZone.style.animation = 'fadeIn 0.3s ease-in-out';
    setTimeout(() => {
      dropZone.style.animation = '';
    }, 300);
  }
}

// Actualizar banco de palabras con diseño moderno
function updateWordBank(teamNum) {
  const wordBank = document.getElementById(`word-bank-${teamNum}`);
  if (!wordBank) return;
  
  const state = gameStates[teamNum];
  const activity = TEAM_ACTIVITIES[teamNum];
  
  if (state.wordsearchFound.size === activity.wordsearch.words.length) {
    // Todas las palabras encontradas - crear banco de palabras moderno
    wordBank.innerHTML = '';
    
    // Título del banco
    const bankTitle = document.createElement('div');
    bankTitle.className = 'text-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-2 border-b border-gray-300 dark:border-gray-600';
    bankTitle.innerHTML = '¡Arrastra las palabras al código!';
    wordBank.appendChild(bankTitle);
    
    // Contenedor de palabras
    const wordsContainer = document.createElement('div');
    wordsContainer.className = 'space-y-2';
    
    activity.wordsearch.words.forEach((word, index) => {
      const wordElement = document.createElement('div');
      wordElement.className = 'group relative bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-4 py-3 rounded-lg cursor-move transition-all duration-300 transform hover:scale-105 hover:shadow-lg font-bold text-center text-sm select-none';
      wordElement.textContent = word;
      wordElement.draggable = true;
      
      // Efecto de drag
      wordElement.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', word);
        wordElement.classList.add('opacity-40', 'scale-95');
        
        // Efecto visual en todo el banco
        wordBank.classList.add('ring-2', 'ring-blue-300', 'dark:ring-blue-600');
      });
      
      wordElement.addEventListener('dragend', () => {
        wordElement.classList.remove('opacity-40', 'scale-95');
        wordBank.classList.remove('ring-2', 'ring-blue-300', 'dark:ring-blue-600');
      });
      
      // Efecto hover adicional
      wordElement.addEventListener('mouseenter', () => {
        wordElement.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.4)';
      });
      
      wordElement.addEventListener('mouseleave', () => {
        wordElement.style.boxShadow = '';
      });
      
      wordsContainer.appendChild(wordElement);
    });
    
    wordBank.appendChild(wordsContainer);
    
    // Mensaje de ayuda
    const helpMessage = document.createElement('div');
    helpMessage.className = 'text-center text-xs text-gray-500 dark:text-gray-400 mt-3 pt-2 border-t border-gray-300 dark:border-gray-600';
    helpMessage.textContent = `${activity.wordsearch.words.length} palabras disponibles`;
    wordBank.appendChild(helpMessage);
    
  } else {
    // Mostrar progreso de búsqueda de palabras
    const foundCount = state.wordsearchFound.size;
    const totalCount = activity.wordsearch.words.length;
    const percentage = Math.round((foundCount / totalCount) * 100);
    
    wordBank.innerHTML = `
      <div class="text-center py-8">
        <h6 class="font-bold text-gray-700 dark:text-gray-300 mb-2">Búsqueda en Progreso</h6>
        <div class="bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-3 overflow-hidden">
          <div class="bg-gradient-to-r from-yellow-400 to-orange-500 h-full rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          <span class="font-bold text-blue-600 dark:text-blue-400">${foundCount}</span> de 
          <span class="font-bold">${totalCount}</span> palabras encontradas
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">
          Completa la búsqueda para activar el banco de palabras
        </p>
      </div>
    `;
  }
}

// Actualizar progreso del drag-drop con efectos modernos
function updateProgress(teamNum) {
  const activity = TEAM_ACTIVITIES[teamNum];
  const state = gameStates[teamNum];
  const progressBar = document.getElementById(`progress-bar-${teamNum}`);
  const progressText = document.getElementById(`progress-text-${teamNum}`);
  
  if (!progressBar || !progressText || !activity.dragdrop) return;
  
  const completed = state.dragdropCorrect.size;
  const total = activity.dragdrop.blanks.length;
  const percentage = (completed / total) * 100;
  
  // Actualizar barra de progreso con animación
  progressBar.style.width = `${percentage}%`;
  
  // Cambiar color según progreso
  if (percentage === 100) {
    progressBar.className = 'bg-gradient-to-r from-green-500 to-emerald-600 h-full rounded-full transition-all duration-500 flex items-center justify-center text-white text-xs font-bold';
    progressBar.textContent = '¡Completado!';
  } else if (percentage >= 75) {
    progressBar.className = 'bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-500 flex items-center justify-center text-white text-xs font-bold';
    progressBar.textContent = `${Math.round(percentage)}%`;
  } else if (percentage >= 50) {
    progressBar.className = 'bg-gradient-to-r from-yellow-500 to-orange-600 h-full rounded-full transition-all duration-500 flex items-center justify-center text-white text-xs font-bold';
    progressBar.textContent = `${Math.round(percentage)}%`;
  } else {
    progressBar.className = 'bg-gradient-to-r from-gray-500 to-gray-600 h-full rounded-full transition-all duration-500 flex items-center justify-center text-white text-xs font-bold';
    progressBar.textContent = percentage > 0 ? `${Math.round(percentage)}%` : '';
  }
  
  // Actualizar texto con emojis
  const progressEmoji = percentage === 100 ? '¡Perfecto!' : 
                       percentage >= 75 ? 'Casi lo logras' : 
                       percentage >= 50 ? '¡Bien hecho!' : 
                       percentage > 0 ? '¡Sigue así!' : '¡Comienza ya!';
  
  progressText.innerHTML = `
    <span class="inline-flex items-center space-x-1">
      <span>${progressEmoji}</span>
      <span><strong>${completed}</strong> de <strong>${total}</strong> espacios completados</span>
    </span>
  `;
}

// Verificar completitud de actividades
function checkActivityCompletion(teamNum) {
  const activity = TEAM_ACTIVITIES[teamNum];
  const state = gameStates[teamNum];
  
  const wordsearchComplete = state.wordsearchFound.size === activity.wordsearch.words.length;
  const dragdropComplete = activity.dragdrop ? 
    state.dragdropCorrect.size === activity.dragdrop.blanks.length : true;
  
  if (wordsearchComplete && dragdropComplete) {
    showCompletionModal(teamNum);
  }
}

// Inicializar estado del juego para drag-drop
function initGameState(teamNum) {
  if (!gameStates[teamNum]) {
    gameStates[teamNum] = {
      wordsearchFound: new Set(),
      dragdropCorrect: new Set()
    };
  }
  
  // Asegurar que dragdropCorrect existe
  if (!gameStates[teamNum].dragdropCorrect) {
    gameStates[teamNum].dragdropCorrect = new Set();
  }
}

// Calcular y actualizar la calificación actual
function updateCurrentGrade(teamNum) {
  const activity = TEAM_ACTIVITIES[teamNum];
  const state = gameStates[teamNum];
  
  if (!activity) return;
  
  // Calcular puntuaciones
  const wordsearchTotal = activity.wordsearch.words.length;
  const wordsearchFound = state.wordsearchFound.size;
  const wordsearchScore = wordsearchTotal > 0 ? (wordsearchFound / wordsearchTotal) * 2.5 : 0; // 50% de la nota (2.5/5.0)
  
  const dragdropTotal = activity.dragdrop ? activity.dragdrop.blanks.length : 0;
  const dragdropCorrect = state.dragdropCorrect.size;
  const dragdropScore = dragdropTotal > 0 ? (dragdropCorrect / dragdropTotal) * 2.5 : 0; // 50% de la nota (2.5/5.0)
  
  const totalGrade = wordsearchScore + dragdropScore;
  
  // Actualizar elementos del DOM
  const gradeElement = document.getElementById('current-grade');
  const progressBar = document.getElementById('grade-progress-bar');
  const wordsearchScoreElement = document.getElementById('wordsearch-score');
  const dragdropScoreElement = document.getElementById('dragdrop-score');
  
  if (gradeElement) {
    gradeElement.textContent = totalGrade.toFixed(1);
    
    // Cambiar color según la nota
    gradeElement.className = 'text-4xl font-bold text-transparent bg-clip-text';
    if (totalGrade >= 4.5) {
      gradeElement.classList.add('bg-gradient-to-r', 'from-green-500', 'to-emerald-600');
    } else if (totalGrade >= 3.5) {
      gradeElement.classList.add('bg-gradient-to-r', 'from-blue-500', 'to-cyan-600');
    } else if (totalGrade >= 2.5) {
      gradeElement.classList.add('bg-gradient-to-r', 'from-yellow-500', 'to-orange-500');
    } else {
      gradeElement.classList.add('bg-gradient-to-r', 'from-red-500', 'to-pink-600');
    }
  }
  
  if (progressBar) {
    const percentage = (totalGrade / 5.0) * 100;
    progressBar.style.width = `${percentage}%`;
    
    // Cambiar color de la barra según la nota
    progressBar.className = 'h-full rounded-full transition-all duration-500';
    if (totalGrade >= 4.5) {
      progressBar.classList.add('bg-gradient-to-r', 'from-green-400', 'to-emerald-600');
    } else if (totalGrade >= 3.5) {
      progressBar.classList.add('bg-gradient-to-r', 'from-blue-400', 'to-cyan-600');
    } else if (totalGrade >= 2.5) {
      progressBar.classList.add('bg-gradient-to-r', 'from-yellow-400', 'to-orange-500');
    } else {
      progressBar.classList.add('bg-gradient-to-r', 'from-red-400', 'to-pink-600');
    }
  }
  
  if (wordsearchScoreElement) {
    wordsearchScoreElement.textContent = `${wordsearchFound} / ${wordsearchTotal}`;
  }
  
  if (dragdropScoreElement) {
    dragdropScoreElement.textContent = `${dragdropCorrect} / ${dragdropTotal}`;
  }
  
  // Efecto de celebración si se alcanza la nota máxima
  if (totalGrade === 5.0) {
    celebrateMaxGrade();
  }
}

// Efecto de celebración para nota máxima
function celebrateMaxGrade() {
  const gradeElement = document.getElementById('current-grade');
  if (gradeElement) {
    gradeElement.style.animation = 'pulse 1s ease-in-out 3';
    setTimeout(() => {
      gradeElement.style.animation = '';
    }, 3000);
  }
}

// Mostrar modal de completitud
function showCompletionModal(teamNum) {
  const activity = TEAM_ACTIVITIES[teamNum];
  const modal = document.getElementById('completion-modal');
  const message = document.getElementById('completion-message');
  
  message.textContent = `¡Excelente trabajo! Has completado exitosamente todas las actividades del Equipo ${teamNum}: ${activity.name}. Ahora dominas estos conceptos clave de BPEL.`;
  modal.classList.remove('hidden');
}


