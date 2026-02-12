/**
 * Attio REST API client for tasks.
 * Docs: https://attio.mintlify.app/rest-api/endpoint-reference/tasks
 */

const ATTIO_BASE_URL = "https://api.attio.com/v2";

export interface AttioTask {
  id: { workspace_id: string; task_id: string };
  content_plaintext: string;
  deadline_at: string | null;
  is_completed: boolean;
  assignees: Array<{
    referenced_actor_type: string;
    referenced_actor_id: string;
  }>;
  linked_records: Array<{
    target_object_id: string;
    target_record_id: string;
  }>;
  created_by_actor: { type: string; id: string };
  created_at: string;
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Fetch all incomplete tasks from Attio.
 */
export async function getAttioTasks(apiKey: string): Promise<AttioTask[]> {
  const allTasks: AttioTask[] = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const url = new URL(`${ATTIO_BASE_URL}/tasks`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: headers(apiKey),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Attio GET /tasks failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { data: AttioTask[] };
    allTasks.push(...json.data);

    if (json.data.length < limit) break;
    offset += limit;
  }

  return allTasks;
}

/**
 * Fetch the web_url for a linked record (e.g. a deal, person, company).
 * Returns the URL to the record in the Attio web app, or null if not found.
 */
export async function getRecordWebUrl(
  apiKey: string,
  objectId: string,
  recordId: string
): Promise<string | null> {
  const res = await fetch(
    `${ATTIO_BASE_URL}/objects/${objectId}/records/${recordId}`,
    { method: "GET", headers: headers(apiKey) }
  );

  if (!res.ok) return null;

  const json = (await res.json()) as {
    data: { web_url?: string };
  };
  return json.data.web_url ?? null;
}

/**
 * Create a new task in Attio.
 */
export async function createAttioTask(
  apiKey: string,
  data: {
    content: string;
    deadline_at?: string | null;
    is_completed?: boolean;
  }
): Promise<AttioTask> {
  const res = await fetch(`${ATTIO_BASE_URL}/tasks`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      data: {
        content: data.content,
        format: "plaintext",
        deadline_at: data.deadline_at ?? null,
        is_completed: data.is_completed ?? false,
        linked_records: [],
        assignees: [],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Attio POST /tasks failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data: AttioTask };
  return json.data;
}

/**
 * Update an existing Attio task.
 */
export async function updateAttioTask(
  apiKey: string,
  taskId: string,
  data: {
    content?: string;
    deadline_at?: string | null;
    is_completed?: boolean;
  }
): Promise<AttioTask> {
  const body: Record<string, unknown> = {};
  if (data.deadline_at !== undefined) body.deadline_at = data.deadline_at;
  if (data.is_completed !== undefined) body.is_completed = data.is_completed;

  const res = await fetch(`${ATTIO_BASE_URL}/tasks/${taskId}`, {
    method: "PATCH",
    headers: headers(apiKey),
    body: JSON.stringify({ data: body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Attio PATCH /tasks/${taskId} failed (${res.status}): ${text}`
    );
  }

  const json = (await res.json()) as { data: AttioTask };
  return json.data;
}
