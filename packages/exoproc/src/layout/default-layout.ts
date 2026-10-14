/**
 * Default MDX Layout shipped with Exoproc Engine.
 * Provides a clean, modern tabbed interface for instrumentation and telemetry.
 * Custom frontends can replace this string with their own custom MDX layout.
 */
export const DEFAULT_EXOPROC_LAYOUT_MDX = `
<Tabs>
  <Tab label="Telemetry">
    <Grid cols={2} gap={4}>
      <TargetHUD />
      <CombatTelemetry />
    </Grid>
  </Tab>

  <Tab label="Instrumentation">
    <Grid cols={2}>
      <Card title="Diagnostics">
        <TelemetryView />
      </Card>
      <Card title="Process Inspector">
        <ProcessList />
      </Card>
    </Grid>
  </Tab>
</Tabs>
`.trim();
