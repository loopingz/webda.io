import React, { useMemo, useState } from "react";
import { useTrack } from "../analytics.js";
import { CodeBlock } from "../components/CodeBlock.js";
import { SchemaForm } from "../components/SchemaForm.js";
import {
  Badge,
  EmptyState,
  Fact,
  JsonBlock,
  ListItem,
  MethodBadge,
  SearchInput,
  SplitPanel,
  SubTabs,
  shortName
} from "../components/ui.js";
import { useDebugConnection } from "../connection.js";
import type { DebugOperation, JsonSchema } from "../types.js";

/**
 * Generate an example value from a JSON Schema.
 *
 * @param schema - the schema
 * @param name - property name, used for string placeholders
 * @returns a plausible value
 */
export function randomValue(schema: JsonSchema | undefined, name?: string): unknown {
  if (!schema) return null;
  if (schema.enum) return schema.enum[Math.floor(Math.random() * schema.enum.length)];
  if (schema.const !== undefined) return schema.const;
  switch (schema.type) {
    case "string":
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uri" || schema.format === "url") return "https://example.com";
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "date") return new Date().toISOString().split("T")[0];
      if (schema.format === "uuid")
        return typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "00000000-0000-4000-8000-000000000000";
      if (schema.pattern) return `match-${name || "value"}`;
      if (schema.minLength) return (name || "text").padEnd(schema.minLength, "x");
      return name || "string-value";
    case "number":
    case "integer": {
      const min = schema.minimum ?? 0;
      const max = schema.maximum ?? 100;
      return schema.type === "integer"
        ? Math.floor(Math.random() * (max - min) + min)
        : +(Math.random() * (max - min) + min).toFixed(2);
    }
    case "boolean":
      return Math.random() > 0.5;
    case "array": {
      const item = schema.items ? randomValue(schema.items, name) : "item";
      return [item, randomValue(schema.items, name)].filter(v => v !== null && v !== undefined && v !== false);
    }
    case "object": {
      if (!schema.properties) return {};
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.properties)) obj[k] = randomValue(v, k);
      return obj;
    }
    default:
      return null;
  }
}

/**
 * Operations panel: filterable list and, per operation, a "Try it" form from
 * its input schema, both schemas, an example output and the implementor's code.
 *
 * @returns the panel element
 */
export function OperationsPanel(): React.JSX.Element {
  const { data } = useDebugConnection();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("form");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [exampleSeed, setExampleSeed] = useState(0);
  const operations = data.operations;
  const filtered = operations.filter(o => (o.id || "").toLowerCase().includes(filter.toLowerCase()));
  const detail = selected ? operations.find(o => o.id === selected) || null : null;
  const outputSchema = detail?.outputSchema;
  const exampleOutput = useMemo(
    () => (outputSchema ? randomValue(outputSchema, "result") : null),
    [outputSchema, exampleSeed]
  );

  return (
    <SplitPanel
      left={
        <>
          <SearchInput value={filter} placeholder="Filter operations..." onChange={setFilter} />
          {filtered.map(o => (
            <ListItem
              key={o.id}
              active={selected === o.id}
              onClick={() => {
                setSelected(o.id);
                setFormValues({});
                setActiveTab("form");
              }}
            >
              <div className="wdbg-op-item">
                <div>{o.id}</div>
                <div className="wdbg-op-io">
                  {o.input && o.input !== "void" ? shortName(o.input).split(".").pop() : "void"}
                  {" → "}
                  {o.output && o.output !== "void" ? shortName(o.output).split(".").pop() : "void"}
                </div>
                {o.rest?.method && (
                  <div className="wdbg-op-rest">
                    <MethodBadge method={o.rest.method} small />
                    <span className="wdbg-mono wdbg-muted wdbg-ellipsis">{o.rest.url || o.rest.path || "/"}</span>
                  </div>
                )}
              </div>
            </ListItem>
          ))}
          {filtered.length === 0 && <div className="wdbg-muted wdbg-pad">No operations found</div>}
        </>
      }
      right={
        detail ? (
          <OperationDetail
            op={detail}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            formValues={formValues}
            setFormValues={setFormValues}
            exampleOutput={exampleOutput}
            regenerate={() => setExampleSeed(s => s + 1)}
          />
        ) : (
          <EmptyState>Select an operation to view details</EmptyState>
        )
      }
    />
  );
}

/**
 * Detail of one operation.
 *
 * @param props - the operation and the tab / form state
 * @returns the detail element
 */
function OperationDetail(props: {
  op: DebugOperation;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  formValues: Record<string, unknown>;
  setFormValues: (values: Record<string, unknown>) => void;
  exampleOutput: unknown;
  regenerate: () => void;
}): React.JSX.Element {
  const { op, activeTab, setActiveTab, formValues, setFormValues, exampleOutput, regenerate } = props;
  const track = useTrack();
  const tabs: { id: string; label: string }[] = [];
  if (op.inputSchema) tabs.push({ id: "form", label: "Try It" });
  tabs.push({ id: "input-schema", label: "Input Schema" }, { id: "output-schema", label: "Output Schema" });
  if (exampleOutput !== null) tabs.push({ id: "example", label: "Example Output" });
  if (op.implementor?.code) tabs.push({ id: "code", label: "Code" });
  const currentTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0].id;
  const hasInput = !!op.input && op.input !== "void";
  const hasOutput = !!op.output && op.output !== "void";

  return (
    <div>
      <h2 className="wdbg-title">{op.id}</h2>
      {op.summary && <div className="wdbg-muted wdbg-subtitle">{op.summary}</div>}
      <div className="wdbg-facts">
        <Fact label="Input">
          <span className="wdbg-mono">{hasInput ? op.input : "void"}</span>
        </Fact>
        <Fact label="Output">
          <span className="wdbg-mono">{hasOutput ? op.output : "void"}</span>
        </Fact>
        {op.implementor && (
          <Fact label={op.implementor.type === "model" ? "Model" : "Service"}>
            <span className="wdbg-mono">{op.implementor.name}</span>
            {op.implementor.method && <span className="wdbg-mono wdbg-muted">.{op.implementor.method}()</span>}
          </Fact>
        )}
        {op.tags?.map(t => (
          <Badge key={t} variant="purple">
            {t}
          </Badge>
        ))}
        {op.rest && typeof op.rest === "object" && op.rest.method && (
          <>
            <MethodBadge method={op.rest.method} />
            <span className="wdbg-mono wdbg-muted">{op.rest.url || op.rest.path || "/"}</span>
          </>
        )}
      </div>
      <SubTabs tabs={tabs} active={currentTab} onChange={setActiveTab} />
      {currentTab === "form" && op.inputSchema && (
        <div>
          <SchemaForm schema={op.inputSchema} values={formValues} onChange={setFormValues} />
          <div className="wdbg-actions">
            <button
              type="button"
              className="wdbg-btn wdbg-btn-primary"
              disabled
              title="Executing operations from the dashboard is not available yet"
              onClick={() => track("operation_invoked")}
            >
              Execute (coming soon)
            </button>
          </div>
          {Object.keys(formValues).length > 0 && (
            <div className="wdbg-preview">
              <strong className="wdbg-preview-label">Request Body</strong>
              <JsonBlock value={formValues} maxHeight={200} />
            </div>
          )}
        </div>
      )}
      {currentTab === "input-schema" &&
        (hasInput && op.inputSchema ? (
          <JsonBlock value={op.inputSchema} />
        ) : (
          <div className="wdbg-muted wdbg-pad">
            {hasInput ? `Schema ref: ${op.input} (not resolved)` : "No input (void)"}
          </div>
        ))}
      {currentTab === "output-schema" &&
        (hasOutput && op.outputSchema ? (
          <JsonBlock value={op.outputSchema} />
        ) : (
          <div className="wdbg-muted wdbg-pad">
            {hasOutput ? `Schema ref: ${op.output} (not resolved)` : "No output (void)"}
          </div>
        ))}
      {currentTab === "example" && (
        <div>
          <div className="wdbg-row-between">
            <strong className="wdbg-preview-label">Random Example</strong>
            <button type="button" className="wdbg-btn wdbg-btn-ghost" onClick={regenerate}>
              Regenerate
            </button>
          </div>
          <JsonBlock value={exampleOutput} />
        </div>
      )}
      {currentTab === "code" && op.implementor?.code && (
        <div>
          <div className="wdbg-muted wdbg-subtitle">
            <span className="wdbg-mono">
              {op.implementor.name}.{op.implementor.method}()
            </span>
          </div>
          <CodeBlock code={op.implementor.code} />
        </div>
      )}
    </div>
  );
}
