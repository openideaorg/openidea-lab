import { FlowPage } from '../flow';

export default function PaperPage() {
  return (
    <FlowPage
      kind="paper"
      title="Start from a paper"
      placeholder="Paste the paper's abstract and method section, or the full text…"
      hint="Muse picks one figure or table that can be reproduced on small data and writes a Python script. Pyodide runs it here; Muse fixes it if it fails."
    />
  );
}
