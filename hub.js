#!/usr/bin/env node
/**
 * CREATIVIA EXECUTIVE ASSISTANT — SUPABASE BRIDGE
 * Zero dipendenze esterne: usa solo fetch e crypto nativi di Node.js (v18+).
 * Gestisce l'inserimento istantaneo di Attività e Note dal Cloud verso Creativia Hub.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carica variabili d'ambiente da .env se presente
function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ekfnekrjpumjpetzgwzy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Errore: Variabile SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY) mancante.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Prefer: 'return=representation'
};

async function api(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Supabase API [${res.status}]: ${errorText}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Trova cliente per ID esatto o ricerca case-insensitive su company_name o contact_name
async function findClient(query) {
  if (!query) throw new Error('Nome cliente mancante (--client "<nome>")');
  
  // Se è già un UUID valido
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(query)) {
    const clients = await api(`clients?id=eq.${query}&select=id,company_name,contact_name,status`);
    if (clients && clients.length > 0) return clients[0];
  }

  // Cerca per company_name
  const cleanQuery = encodeURIComponent(`*${query.trim()}*`);
  const clients = await api(`clients?or=(company_name.ilike.${cleanQuery},contact_name.ilike.${cleanQuery})&select=id,company_name,contact_name,status&limit=10`);

  if (!clients || clients.length === 0) {
    throw new Error(`Nessun cliente trovato con termine: "${query}". Usa "list-clients" per vedere l'elenco.`);
  }

  // Match esatto o primo risultato più pertinente
  const exact = clients.find(c => c.company_name?.toLowerCase() === query.toLowerCase().trim());
  return exact || clients[0];
}

// 1. LISTA CLIENTI
async function handleListClients() {
  const clients = await api('clients?select=id,company_name,contact_name,status&order=company_name.asc');
  console.log(`\n📋 Trovati ${clients.length} clienti in Creativia Hub:\n`);
  for (const c of clients) {
    const contact = c.contact_name ? ` (${c.contact_name})` : '';
    console.log(` • [${c.company_name}${contact}] -> ID: ${c.id}`);
  }
}

// 2. AGGIUNGI ATTIVITÀ (TASK)
async function handleAddTask(args) {
  const clientQuery = args.client;
  const title = args.title;
  if (!title) throw new Error('Titolo attività mancante (--title "<titolo>")');

  let clientId = null;
  let clientName = 'Generico / Studio';

  if (clientQuery) {
    const client = await findClient(clientQuery);
    clientId = client.id;
    clientName = client.company_name;
  }

  const priority = args.priority || 'medium';
  const taskType = args.type || (title.toLowerCase().startsWith('call') ? 'call' : 'task');
  const dueDate = args.due || null; // formato YYYY-MM-DD
  const dueTime = args.time || null; // formato HH:MM
  const bucket = args.bucket || (priority === 'urgent' || priority === 'high' ? 'impact' : 'impact');
  const description = args.desc || '';

  // Costruisce la descrizione packed standard di Creativia Hub
  const tags = [];
  if (taskType && taskType !== 'task') tags.push(`[TYPE:${taskType}]`);
  if (dueTime) tags.push(`[TIME:${dueTime}]`);
  if (priority && priority !== 'medium') tags.push(`[PRIORITY:${priority}]`);
  tags.push(`[BUCKET:${bucket}]`);

  const packedDescription = `${tags.join(' ')}\n${description}`.trim();

  let finalDueDate = null;
  if (dueDate) {
    finalDueDate = dueTime ? `${dueDate.split('T')[0]}T${dueTime}:00` : `${dueDate.split('T')[0]}T09:00:00`;
  }

  const payload = {
    client_id: clientId,
    title: title.trim(),
    description: packedDescription,
    status: 'todo',
    due_date: finalDueDate,
    category: taskType === 'call' ? 'call' : null,
    is_archived: false
  };

  const inserted = await api('tasks', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log(`\n✅ ATTIVITÀ REGISTRATA NELL'HUB!`);
  console.log(`• Cliente: ${clientName}`);
  console.log(`• Titolo: ${payload.title}`);
  console.log(`• Priorità: ${priority.toUpperCase()}`);
  if (finalDueDate) console.log(`• Scadenza: ${finalDueDate}`);
  console.log(`• ID Task: ${inserted[0]?.id || 'creato'}`);
}

// 3. REGISTRA NOTA POST-INCONTRO / CALL (SCUDO LEGALE)
async function handleAddNote(args) {
  const clientQuery = args.client;
  const content = args.content || args.desc;
  if (!clientQuery) throw new Error('Cliente mancante (--client "<nome>")');
  if (!content) throw new Error('Contenuto nota mancante (--content "<testo>")');

  const client = await findClient(clientQuery);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const title = args.title || `Incontro / Nota ${dateStr} — ${client.company_name}`;
  const participants = args.participants || client.contact_name || 'Mario, Cliente';

  // Hash univoco del contenuto per idempotenza
  const sha256 = createHash('sha256').update(`${client.id}_${now.toISOString()}_${content}`).digest('hex');

  // Costruzione righe verbatim per scudo legale (L1)
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const shieldContent = lines.map((line, idx) => `[L${idx + 1}] ${line}`).join('\n');

  const payload = {
    client_id: client.id,
    title,
    call_date: now.toISOString(),
    participants,
    sha256,
    verbale: content,
    shield_content: shieldContent,
    raw_content: content,
    recap: content.length > 200 ? content.slice(0, 197) + '...' : content,
    metadata: {
      source: 'mobile_executive_assistant',
      channel: 'meeting_notes',
      recorded_by: 'mario'
    }
  };

  const inserted = await api('client_calls', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log(`\n🛡️ NOTA INCONTRO SALVATA A SCUDO LEGALE NELL'HUB!`);
  console.log(`• Cliente: ${client.company_name}`);
  console.log(`• Titolo: ${title}`);
  console.log(`• Partecipanti: ${participants}`);
  console.log(`• Righe registrate: ${lines.length}`);
  console.log(`• ID Comunicazione: ${inserted[0]?.id || 'creato'}`);
}

// 4. STATO CLIENTE
async function handleGetClient(args) {
  const clientQuery = args.client;
  if (!clientQuery) throw new Error('Cliente mancante (--client "<nome>")');

  const client = await findClient(clientQuery);
  const tasks = await api(`tasks?client_id=eq.${client.id}&is_archived=eq.false&status=neq.done&select=id,title,status,priority,due_date&order=created_at.desc&limit=5`);
  const calls = await api(`client_calls?client_id=eq.${client.id}&select=id,title,call_date,recap&order=call_date.desc&limit=3`);

  console.log(`\n🏢 SCHEDA CLIENTE: ${client.company_name}`);
  console.log(`• Referente: ${client.contact_name || 'N/D'}`);
  console.log(`• Stato Cliente: ${client.status}`);

  console.log(`\n📌 ATTIVITÀ APERTE (${tasks.length}):`);
  if (tasks.length === 0) {
    console.log('  (Nessun task in sospeso)');
  } else {
    for (const t of tasks) {
      const due = t.due_date ? ` [Scad: ${t.due_date.split('T')[0]}]` : '';
      console.log(` • [${t.status.toUpperCase()}] ${t.title}${due}`);
    }
  }

  console.log(`\n📡 ULTIME NOTE/INCONTRI (${calls.length}):`);
  if (calls.length === 0) {
    console.log('  (Nessuna call/nota recente)');
  } else {
    for (const c of calls) {
      console.log(` • ${c.call_date.split('T')[0]}: ${c.title}`);
      if (c.recap) console.log(`   "${c.recap}"`);
    }
  }
}

// 5. COMPLETA ATTIVITÀ
async function handleCompleteTask(args) {
  const clientQuery = args.client;
  const taskQuery = args.title || args.id;
  if (!taskQuery) throw new Error('Specificare task da completare (--title "<titolo_o_parte>")');

  let tasks = [];
  if (clientQuery) {
    const client = await findClient(clientQuery);
    tasks = await api(`tasks?client_id=eq.${client.id}&is_archived=eq.false&status=neq.done&select=id,title`);
  } else {
    tasks = await api(`tasks?is_archived=eq.false&status=neq.done&select=id,title`);
  }

  const match = tasks.find(t => t.id === taskQuery || t.title.toLowerCase().includes(taskQuery.toLowerCase()));
  if (!match) {
    throw new Error(`Nessun task aperto trovato corrispondente a "${taskQuery}".`);
  }

  await api(`tasks?id=eq.${match.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'done',
      is_archived: true,
      completed_at: new Date().toISOString()
    })
  });

  console.log(`\n🎉 ATTIVITÀ COMPLETATA E ARCHIVIATA: "${match.title}"`);
}

// PARSER ARGOMENTI CLI
function parseArgs() {
  const raw = process.argv.slice(2);
  const command = raw[0];
  const args = {};

  for (let i = 1; i < raw.length; i++) {
    const arg = raw[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : true;
      args[key] = val;
    }
  }

  return { command, args };
}

// MAIN ENTRYPOINT
async function main() {
  const { command, args } = parseArgs();

  try {
    switch (command) {
      case 'list-clients':
        await handleListClients();
        break;
      case 'add-task':
        await handleAddTask(args);
        break;
      case 'add-note':
        await handleAddNote(args);
        break;
      case 'get-client':
        await handleGetClient(args);
        break;
      case 'complete-task':
        await handleCompleteTask(args);
        break;
      default:
        console.log(`
Creativia Executive Assistant — CLI

Uso:
  node hub.js list-clients
  node hub.js add-task --client "<nome>" --title "<titolo>" [--due "YYYY-MM-DD"] [--time "HH:MM"] [--priority "urgent|high|medium|low"] [--desc "<dettagli>"]
  node hub.js add-note --client "<nome>" --content "<testo_della_nota>" [--title "<titolo>"] [--participants "<nomi>"]
  node hub.js get-client --client "<nome>"
  node hub.js complete-task [--client "<nome>"] --title "<parola_chiave_o_titolo>"
`);
    }
  } catch (err) {
    console.error(`\n❌ ERRORE: ${err.message}`);
    process.exit(1);
  }
}

main();
