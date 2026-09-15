// Meta WhatsApp Flows API. A Flow is authored in our own screen model (flows.screens),
// compiled to Meta's Flow JSON on publish, and then sent as an interactive/flow message.
// Docs: https://developers.facebook.com/docs/whatsapp/flows
const GRAPH = "https://graph.facebook.com/v20.0";

export type FlowScreen = {
  id: string;
  title: string;
  terminal?: boolean;
  ctaLabel?: string;
  fields: Array<{ name: string; label: string; type: string; required?: boolean; options?: string[] }>;
};

// Our field types -> Flow JSON component names.
const COMPONENT: Record<string, string> = {
  text: "TextInput",
  textarea: "TextArea",
  email: "TextInput",
  number: "TextInput",
  phone: "TextInput",
  date: "DatePicker",
  dropdown: "Dropdown",
  radio: "RadioButtonsGroup",
  checkbox: "CheckboxGroup",
  optin: "OptIn",
};

const INPUT_TYPE: Record<string, string> = {
  text: "text", email: "email", number: "number", phone: "phone",
};

export function compileFlowJson(screens: FlowScreen[]): Record<string, unknown> {
  const list = screens.length ? screens : [];
  return {
    version: "5.0",
    screens: list.map((screen, idx) => {
      const isLast = screen.terminal ?? idx === list.length - 1;
      const children: unknown[] = screen.fields.map((f) => {
        const comp = COMPONENT[f.type] ?? "TextInput";
        const node: Record<string, unknown> = {
          type: comp,
          name: f.name,
          label: f.label,
          required: f.required ?? false,
        };
        if (comp === "TextInput" && INPUT_TYPE[f.type]) node["input-type"] = INPUT_TYPE[f.type];
        if (["Dropdown", "RadioButtonsGroup", "CheckboxGroup"].includes(comp)) {
          node["data-source"] = (f.options ?? []).map((o, i) => ({ id: `${i}`, title: o }));
        }
        return node;
      });
      children.push({
        type: "Footer",
        label: screen.ctaLabel || (isLast ? "Submit" : "Continue"),
        "on-click-action": isLast
          ? { name: "complete", payload: Object.fromEntries(screen.fields.map((f) => [f.name, `\${form.${f.name}}`])) }
          : { name: "navigate", next: { type: "screen", name: list[idx + 1]?.id }, payload: {} },
      });
      return {
        id: screen.id,
        title: screen.title,
        ...(isLast ? { terminal: true } : {}),
        layout: { type: "SingleColumnLayout", children: [{ type: "Form", name: `form_${screen.id}`, children }] },
      };
    }),
  };
}

function creds(credentials: Record<string, string>) {
  const { accessToken, wabaId } = credentials;
  if (!accessToken || !wabaId) {
    throw new Error(
      "Publishing a Flow needs the channel's accessToken and wabaId (WhatsApp Business Account ID). " +
      "Add wabaId to this channel's credentials in Channels > Edit, then publish again."
    );
  }
  return { accessToken, wabaId };
}

// Create (or update) then publish. Returns Meta's flow id.
export async function publishFlow(
  credentials: Record<string, string>,
  opts: { name: string; categories: string[]; screens: FlowScreen[]; existingFlowId?: string | null }
): Promise<{ metaFlowId: string }> {
  const { accessToken, wabaId } = creds(credentials);
  let flowId = opts.existingFlowId ?? null;

  if (!flowId) {
    const res = await fetch(`${GRAPH}/${wabaId}/flows`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: opts.name, categories: opts.categories.length ? opts.categories : ["OTHER"] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Flow create failed: ${data?.error?.message ?? res.statusText}`);
    flowId = data.id as string;
  }

  // Upload the compiled Flow JSON as the flow's asset
  const form = new FormData();
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  form.append("file", new Blob([JSON.stringify(compileFlowJson(opts.screens))], { type: "application/json" }), "flow.json");
  const assetRes = await fetch(`${GRAPH}/${flowId}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const assetData = await assetRes.json();
  if (!assetRes.ok) {
    const validation = assetData?.validation_errors?.map((v: any) => v.message).join("; ");
    throw new Error(`Flow JSON upload failed: ${validation || assetData?.error?.message || assetRes.statusText}`);
  }

  const pubRes = await fetch(`${GRAPH}/${flowId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const pubData = await pubRes.json();
  if (!pubRes.ok) throw new Error(`Flow publish failed: ${pubData?.error?.message ?? pubRes.statusText}`);

  return { metaFlowId: flowId! };
}

export async function deprecateFlow(credentials: Record<string, string>, metaFlowId: string) {
  const { accessToken } = creds(credentials);
  const res = await fetch(`${GRAPH}/${metaFlowId}/deprecate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Flow deprecate failed: ${data?.error?.message ?? res.statusText}`);
  return true;
}
