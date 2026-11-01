const base = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
let token = '';
export let cloudUser = '';
export type SharedNote = { id: string; title: string; body: string; revision: number; updated_at: string };
async function request(path: string, method = 'GET', data?: unknown) {
  if (!base || !key) throw new Error('Shared Notes needs online account setup. Your local recordings are still available.');
  const response = await fetch(`${base}${path}`, { method, headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.msg || result?.message || result?.error_description || 'Could not connect. Your draft has not been discarded.');
  return result;
}
export async function signIn(email: string, password: string) {
 const r = await request('/auth/v1/token?grant_type=password','POST',{email,password});
 token=r.access_token; cloudUser=r.user.email;
}
export async function signUp(email: string,password: string) { await request('/auth/v1/signup','POST',{email,password}); }
export function signOut() { token=''; cloudUser=''; }
export async function listShared(): Promise<SharedNote[]> { return request('/rest/v1/shared_notes?select=*&order=updated_at.desc'); }
export async function createShared(title: string,body: string) { return request('/rest/v1/shared_notes','POST',{title,body}); }
export async function saveShared(n: SharedNote,title: string,body: string): Promise<SharedNote> { return request('/rest/v1/rpc/save_shared_note','POST',{note:n.id,expected_revision:n.revision,new_title:title,new_body:body}); }
export async function invite(note: string,email: string,role: string) { return request('/rest/v1/note_members','POST',{note_id:note,email:email.trim().toLowerCase(),role}); }
export async function members(note: string): Promise<{email:string;role:string}[]> { return request(`/rest/v1/note_members?note_id=eq.${encodeURIComponent(note)}&select=email,role`); }
export async function revoke(note: string,email: string) { return request(`/rest/v1/note_members?note_id=eq.${encodeURIComponent(note)}&email=eq.${encodeURIComponent(email)}`,'DELETE'); }
