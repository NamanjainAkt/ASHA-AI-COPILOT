import { Patient, Screening, FollowUp, Worker, DashboardSummary } from '../types';

const API_BASE = window.location.origin;

let cachedToken: string = localStorage.getItem('asha_token') || '';

export async function ensureAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'supervisor',
        password: 'password123',
        role: 'supervisor'
      })
    });
    if (res.ok) {
      const data = await res.json();
      cachedToken = data.access_token;
      localStorage.setItem('asha_token', cachedToken);
      return cachedToken;
    }
  } catch (err) {
    console.warn('Auto auth failed:', err);
  }
  return '';
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await ensureAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    // Retry once with new token
    localStorage.removeItem('asha_token');
    cachedToken = '';
    const newToken = await ensureAuthToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(url, { ...options, headers });
    }
  }
  return response;
}

// Summary & Dashboard API
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await authFetch(`${API_BASE}/dashboard/summary`);
  if (!res.ok) throw new Error('Failed to fetch dashboard summary');
  return res.json();
}

export async function fetchHighPriorityCases(): Promise<FollowUp[]> {
  const res = await authFetch(`${API_BASE}/dashboard/high-priority`);
  if (!res.ok) throw new Error('Failed to fetch high-priority cases');
  return res.json();
}

export async function fetchDashboardWorkers(): Promise<Worker[]> {
  const res = await authFetch(`${API_BASE}/dashboard/workers`);
  if (!res.ok) throw new Error('Failed to fetch workers');
  return res.json();
}

// Patients API
export async function fetchPatients(search?: string, village?: string, limit = 100, offset = 0): Promise<Patient[]> {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (village) params.append('village', village);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const res = await authFetch(`${API_BASE}/patients?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch patients');
  return res.json();
}

export async function createPatient(patientData: Partial<Patient>): Promise<Patient> {
  const payload = {
    id: patientData.id || crypto.randomUUID(),
    name: patientData.name,
    age: patientData.age ? Number(patientData.age) : null,
    sex: patientData.sex || 'female',
    phone: patientData.phone || null,
    village: patientData.village,
    household_id: patientData.household_id || null,
    phone_owner: patientData.phone_owner || 'self',
    hamlet_tola: patientData.hamlet_tola || null,
    relationship_head: patientData.relationship_head || null,
    abha_id: patientData.abha_id || null,
    disability_notes: patientData.disability_notes || null,
    created_at: patientData.created_at || new Date().toISOString(),
    sync_status: 'synced'
  };

  const res = await authFetch(`${API_BASE}/patients`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to save patient');
  return res.json();
}

export async function deletePatient(patientId: string): Promise<boolean> {
  // Monotonic soft-delete via sync push or delete endpoint
  try {
    const res = await authFetch(`${API_BASE}/sync/push`, {
      method: 'POST',
      body: JSON.stringify({
        device_id: 'supervisor-web-cmd',
        worker_id: 'supervisor-001',
        records: [
          {
            client_record_id: patientId,
            entity: 'patient',
            operation: 'delete',
            timestamp: new Date().toISOString(),
            payload: { id: patientId }
          }
        ]
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Screenings API
export async function fetchScreenings(patientId?: string, screeningType?: string, limit = 100, offset = 0): Promise<Screening[]> {
  const params = new URLSearchParams();
  if (patientId) params.append('patient_id', patientId);
  if (screeningType) params.append('screening_type', screeningType);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const res = await authFetch(`${API_BASE}/screenings?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch screenings');
  return res.json();
}

// Follow-ups API
export async function fetchFollowups(status?: string, priority?: string, limit = 100, offset = 0): Promise<FollowUp[]> {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.append('status', status);
  if (priority && priority !== 'all') params.append('priority', priority);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const res = await authFetch(`${API_BASE}/followups?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch followups');
  return res.json();
}

export async function updateFollowup(id: string, data: { status: string; notes?: string }): Promise<FollowUp> {
  const res = await authFetch(`${API_BASE}/followups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to update followup');
  return res.json();
}

export async function createFollowup(data: Partial<FollowUp>): Promise<FollowUp> {
  const payload = {
    id: data.id || crypto.randomUUID(),
    patient_id: data.patient_id,
    screening_id: data.screening_id || null,
    reason: data.reason || 'Follow-up visit required',
    priority: data.priority || 'medium',
    due_date: data.due_date || new Date().toISOString().substring(0, 10),
    status: data.status || 'pending',
    notes: data.notes || '',
    created_at: new Date().toISOString(),
    sync_status: 'synced'
  };

  const res = await authFetch(`${API_BASE}/followups`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to create followup');
  return res.json();
}

// Workers API
export async function createWorker(data: Partial<Worker>): Promise<boolean> {
  const payload = {
    device_id: 'supervisor-web-cmd',
    worker_id: 'supervisor-001',
    records: [
      {
        client_record_id: data.id || crypto.randomUUID(),
        entity: 'worker',
        operation: 'create',
        timestamp: new Date().toISOString(),
        payload: {
          id: data.id || crypto.randomUUID(),
          name: data.name,
          role: data.role || 'asha',
          phone: data.phone || null,
          village: data.village,
          sub_center: data.sub_center || null,
          created_at: new Date().toISOString()
        }
      }
    ]
  };

  const res = await authFetch(`${API_BASE}/sync/push`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return res.ok;
}

// Export CSV Helper
export function exportToCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines: string[] = [];
  
  csvLines.push(headers.join(','));

  for (const row of rows) {
    const values = headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return '""';
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    csvLines.push(values.join(','));
  }

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
