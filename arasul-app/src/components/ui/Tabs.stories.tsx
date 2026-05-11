import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";

export default {
  title: "ui/Tabs",
};

export const Horizontal = () => (
  <Tabs defaultValue="overview" className="max-w-xl">
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="runs">Runs</TabsTrigger>
      <TabsTrigger value="logs">Logs</TabsTrigger>
      <TabsTrigger value="settings">Settings</TabsTrigger>
    </TabsList>
    <TabsContent value="overview" className="p-4 text-fg">
      <h4 className="font-medium">Workflow overview</h4>
      <p className="text-fg-muted">Run history, scheduled triggers, recent failures.</p>
    </TabsContent>
    <TabsContent value="runs" className="p-4 text-fg">
      <h4 className="font-medium">Runs</h4>
      <p className="text-fg-muted">List of every run with status + cost.</p>
    </TabsContent>
    <TabsContent value="logs" className="p-4 text-fg">
      <h4 className="font-medium">Logs</h4>
      <p className="text-fg-muted">Raw stdout from each step.</p>
    </TabsContent>
    <TabsContent value="settings" className="p-4 text-fg">
      <h4 className="font-medium">Settings</h4>
      <p className="text-fg-muted">YAML config, budget thresholds, env vars.</p>
    </TabsContent>
  </Tabs>
);

export const Vertical = () => (
  <Tabs orientation="vertical" defaultValue="general" className="flex max-w-2xl gap-4">
    <TabsList orientation="vertical">
      <TabsTrigger value="general">General</TabsTrigger>
      <TabsTrigger value="appearance">Appearance</TabsTrigger>
      <TabsTrigger value="editor">Editor</TabsTrigger>
      <TabsTrigger value="terminal">Terminal</TabsTrigger>
      <TabsTrigger value="claude">Claude AI</TabsTrigger>
    </TabsList>
    <div className="flex-1 min-w-0">
      <TabsContent value="general" className="text-fg">General tab body.</TabsContent>
      <TabsContent value="appearance" className="text-fg">Appearance tab body.</TabsContent>
      <TabsContent value="editor" className="text-fg">Editor tab body.</TabsContent>
      <TabsContent value="terminal" className="text-fg">Terminal tab body.</TabsContent>
      <TabsContent value="claude" className="text-fg">Claude AI tab body.</TabsContent>
    </div>
  </Tabs>
);

export const DisabledTab = () => (
  <Tabs defaultValue="a" className="max-w-xl">
    <TabsList>
      <TabsTrigger value="a">Available</TabsTrigger>
      <TabsTrigger value="b" disabled>Coming soon</TabsTrigger>
      <TabsTrigger value="c">Also available</TabsTrigger>
    </TabsList>
    <TabsContent value="a" className="p-4 text-fg">First tab.</TabsContent>
    <TabsContent value="c" className="p-4 text-fg">Third tab.</TabsContent>
  </Tabs>
);
