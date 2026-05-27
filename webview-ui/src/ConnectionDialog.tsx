import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NAME_FIELD,
  defaultPort,
  getConnectionFields,
  type ClickHouseInterface,
  type Dialect,
  type ConnectionFieldDef,
} from "./connectionFields";
import type { ConnectionDialogInit, ConnectionTagPayload } from "./types";
import { getVsCodeApi } from "./vscodeApi";
import { TagEditor } from "./TagEditor";
import { DialectPicker } from "./DialectPicker";
import { normalizeTags } from "./tagColors";

type FormValues = Record<string, string | boolean>;

const TEST_UI_TIMEOUT_MS = 20_000;

function inferClickHouseInterface(
  port: number,
  explicit?: ClickHouseInterface
): ClickHouseInterface {
  if (explicit) {
    return explicit;
  }
  return port === 8123 || port === 8443 ? "http" : "native";
}

function defaultDatabase(dialect: Dialect): string {
  if (dialect === "postgres") {
    return "postgres";
  }
  if (dialect === "mssql") {
    return "master";
  }
  return "";
}

function buildInitialValues(init: ConnectionDialogInit): FormValues {
  const profile = init.profile;
  const dialect = (profile?.dialect ?? "postgres") as Dialect;
  const chIface =
    dialect === "clickhouse"
      ? inferClickHouseInterface(profile?.port ?? 9000, profile?.clickhouseInterface)
      : "native";
  return {
    name: profile?.name ?? "",
    dialect,
    clickhouseInterface: chIface,
    host: profile?.host ?? "localhost",
    port: String(profile?.port ?? defaultPort(dialect, chIface)),
    database: profile?.database ?? defaultDatabase(dialect),
    username: profile?.username ?? "default",
    password: "",
    ssl: profile?.ssl ?? false,
    readOnly: profile?.readOnly ?? false,
  };
}

function validate(
  fields: ConnectionFieldDef[],
  values: FormValues,
  isEdit: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};
  const allFields = [NAME_FIELD, ...fields];

  for (const field of allFields) {
    const raw = values[field.key];
    if (field.type === "checkbox") {
      continue;
    }
    const value = String(raw ?? "").trim();
    if (field.required && !value) {
      errors[field.key] = `${field.label} is required`;
    }
    if (field.key === "port" && value && !/^\d+$/.test(value)) {
      errors[field.key] = "Port must be a number";
    }
    if (field.key === "password" && field.required && !value && !isEdit) {
      errors[field.key] = "Password is required for new connections";
    }
  }
  return errors;
}

export function ConnectionDialog({ init }: { init: ConnectionDialogInit }) {
  const isEdit = init.mode === "edit";
  const [values, setValues] = useState<FormValues>(() => buildInitialValues(init));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [tags, setTags] = useState<ConnectionTagPayload[]>(() =>
    normalizeTags(init.profile?.tags)
  );

  const dialect = values.dialect as Dialect;
  const clickhouseInterface = (values.clickhouseInterface ?? "native") as ClickHouseInterface;
  const connectionFields = useMemo(
    () =>
      dialect === "clickhouse"
        ? getConnectionFields(dialect, clickhouseInterface)
        : getConnectionFields(dialect),
    [dialect, clickhouseInterface]
  );

  const setField = useCallback((key: string, value: string | boolean) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "dialect") {
        const d = value as Dialect;
        if (d === "clickhouse") {
          next.clickhouseInterface = "native";
        }
        next.port = String(defaultPort(d, d === "clickhouse" ? "native" : undefined));
        if (!isEdit) {
          next.database = defaultDatabase(d);
        }
      }
      if (key === "clickhouseInterface") {
        const iface = value as ClickHouseInterface;
        next.port = String(defaultPort("clickhouse", iface));
      }
      return next;
    });
    setErrors((prev) => {
      if (!prev[key]) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setTestMessage(null);
    setTestOk(null);
  }, [isEdit]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.type !== "testResult") {
        return;
      }
      setTesting(false);
      setTestOk(Boolean(msg.ok));
      setTestMessage(String(msg.message ?? ""));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!testing) {
      return;
    }
    const timer = window.setTimeout(() => {
      setTesting(false);
      setTestOk(false);
      setTestMessage("Connection test timed out. Check host, port, and driver (Native vs HTTP).");
    }, TEST_UI_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [testing]);

  const handleCancel = () => {
    getVsCodeApi()?.postMessage({ type: "cancel" });
  };

  const buildPayload = () => {
    const d = values.dialect as Dialect;
    const dbRaw = String(values.database).trim();
    const database =
      dbRaw ||
      (d === "clickhouse" ? "default" : defaultDatabase(d));
    return {
      name: String(values.name).trim(),
      dialect: d,
      host: String(values.host).trim(),
      port: Number(values.port),
      database,
      username: String(values.username).trim(),
      password: String(values.password ?? ""),
      ssl: Boolean(values.ssl),
      readOnly: Boolean(values.readOnly),
      clickhouseInterface:
        d === "clickhouse"
          ? ((values.clickhouseInterface ?? "native") as ClickHouseInterface)
          : undefined,
      tags: normalizeTags(tags),
      id: init.profile?.id,
    };
  };

  const handleSave = () => {
    const nextErrors = validate(connectionFields, values, isEdit);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    getVsCodeApi()?.postMessage({ type: "save", payload: buildPayload() });
  };

  const handleTest = () => {
    const nextErrors = validate(connectionFields, values, isEdit);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    getVsCodeApi()?.postMessage({ type: "test", payload: buildPayload() });
  };

  const renderField = (field: ConnectionFieldDef) => {
    const id = `field-${field.key}`;
    const error = errors[field.key];

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="form-check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={Boolean(values[field.key])}
            onChange={(e) => setField(field.key, e.target.checked)}
          />
          <span>{field.label}</span>
          {field.hint ? <span className="field-hint">{field.hint}</span> : null}
        </label>
      );
    }

    const isPassword = field.type === "password";
    const passwordPlaceholder = isEdit
      ? "Leave empty to keep current password"
      : field.placeholder ?? "";

    return (
      <div key={field.key} className={`form-row${error ? " has-error" : ""}`}>
        <label htmlFor={id}>
          {field.label}
          {field.required ? <span className="required">*</span> : null}
        </label>
        {field.type === "select" ? (
          <select
            id={id}
            value={String(values[field.key] ?? "")}
            onChange={(e) => setField(field.key, e.target.value)}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={isPassword ? "password" : field.type === "number" ? "number" : "text"}
            value={String(values[field.key] ?? "")}
            placeholder={
              isPassword ? passwordPlaceholder : field.placeholder
            }
            autoComplete={isPassword ? "new-password" : undefined}
            onChange={(e) => setField(field.key, e.target.value)}
          />
        )}
        {field.hint && !error ? <span className="field-hint">{field.hint}</span> : null}
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    );
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" role="dialog" aria-modal="true">
        <header className="modal-header">
          <h2>{isEdit ? "Edit connection" : "New connection"}</h2>
        </header>
        <div className="modal-body">
          {renderField(NAME_FIELD)}
          <div className="form-row">
            <label htmlFor="field-dialect">Database type</label>
            <DialectPicker
              value={dialect}
              icons={init.dialectIcons ?? {}}
              disabled={isEdit}
              onChange={(next) => setField("dialect", next)}
            />
            {isEdit ? (
              <span className="field-hint">Dialect cannot be changed when editing</span>
            ) : null}
          </div>
          {connectionFields.map(renderField)}
          <TagEditor tags={tags} onChange={setTags} />
          {testMessage ? (
            <div className={`test-result${testOk ? " ok" : " fail"}`}>{testMessage}</div>
          ) : null}
        </div>
        <footer className="modal-footer">
          <button type="button" className="secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="secondary" onClick={handleTest} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button type="button" onClick={handleSave}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
