import { useService, useApplication, useCore } from "@webda/core";

const test = useService("memorylogger");

test.parameters.limit = 5000;

const app = useApplication();

app.getModda("sample-app/CustomService");

const core = useCore();

useCore().getService("beanService");
useCore().getServices();
core.getVersion();
core.getLocales();
core.getBeans();

app.completeNamespace("Test");
app.getModdas();
app.getModda("sample-app/BeanService");
// app.getModda("Unknown"); --- IGNORE ---
app.getModel("Project");
app.getWebdaVersion();
