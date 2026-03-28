import { useService, useApplication, useCore } from "@webda/core";

const test = useService("memorylogger");

test.parameters.limit = 5000;

const app = useApplication();

const mod = app.getModda("sample-app/CustomService");

const core = useCore();

const bean = useCore().getService("beanService");
useCore().getServices();
core.getVersion()
core.getLocales()
core.getBeans();

const t = app.completeNamespace("Test")
app.getModdas();
app.getModda("sample-app/BeanService");
// app.getModda("Unknown"); --- IGNORE ---
app.getModel("Project");
app.getWebdaVersion();
