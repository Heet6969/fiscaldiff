/**
 * Import and export.
 *
 * Files are read with the browser File API and parsed in the page. Nothing is
 * uploaded; there is no server to upload to. An import is validated in full
 * before anything is replaced, so a rejected file leaves the current data
 * exactly as it was.
 */
import { useRef, useState } from 'react';
import { useAppState } from '../state/AppState';
import { Disclosure } from './Common';
import { ALL_SCHEMAS, templateCsv, type TableId } from '../../data/csv/schema';
import { importTable, type ImportProblem } from '../../data/csv/importers';
import { datasetTableToCsv } from '../../data/csv/serialize';
import { downloadCsvFile } from '../../export/breakdown';

export function DataPanel() {
  const { dataset, replaceDataset, resetDemo } = useAppState();
  const [table, setTable] = useState<TableId>('employees');
  const [problems, setProblems] = useState<readonly ImportProblem[]>([]);
  const [success, setSuccess] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const schema = ALL_SCHEMAS.find((s) => s.id === table) ?? ALL_SCHEMAS[0];
  if (!schema) throw new Error('No CSV schemas are defined');

  async function handleFile(file: File) {
    setProblems([]);
    setSuccess(undefined);

    const text = await file.text();
    const outcome = importTable(table, text, dataset);

    if (outcome.ok) {
      replaceDataset(outcome.dataset);
      setSuccess(`${file.name}: ${outcome.summary}`);
    } else {
      setProblems(outcome.problems);
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="section" aria-labelledby="data-heading">
      <div className="section__head">
        <h2 id="data-heading">Your own data</h2>
        <p className="section__hint">
          Optional. Files are read in this browser tab and never sent anywhere. Nothing here
          reads documents or connects to payroll.
        </p>
      </div>

      <div className="surface">
        <div style={{ maxWidth: '26rem' }}>
          <div className="field">
            <label className="field__label" htmlFor="table-select">
              Which table
            </label>
            <select
              id="table-select"
              value={table}
              onChange={(e) => {
                setTable(e.target.value as TableId);
                setProblems([]);
                setSuccess(undefined);
              }}
            >
              {ALL_SCHEMAS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="section__hint" style={{ marginBottom: '1rem' }}>
          {schema.description}
        </p>

        <div className="field">
          <label className="field__label" htmlFor="csv-file">
            Import a CSV file
          </label>
          <span className="field__hint" id="csv-file-hint">
            The whole file is checked before anything changes. If it is rejected, your
            current data is untouched.
          </span>
          <input
            ref={fileInput}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="csv-file-hint"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>

        {success ? (
          <p className="success" role="status">
            {success}
          </p>
        ) : null}

        {problems.length > 0 ? (
          <div className="errors" role="alert">
            <h3>
              The file was not imported. {problems.length} problem
              {problems.length === 1 ? '' : 's'} found.
            </h3>
            <p style={{ marginBottom: '0.5rem' }}>
              Your existing data has not changed. Fix the file and try again.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Column</th>
                    <th scope="col">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((problem, index) => (
                    <tr key={`${problem.row}-${problem.column}-${index}`}>
                      <td>{problem.row ?? '—'}</td>
                      <td>{problem.column ?? '—'}</td>
                      <td>{problem.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="button-row" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => downloadCsvFile(`template-${schema.fileName}`, templateCsv(schema))}
          >
            Download blank template
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => downloadCsvFile(schema.fileName, datasetTableToCsv(dataset, table))}
          >
            Download current data
          </button>
          <button type="button" className="button button--secondary" onClick={resetDemo}>
            Reset to the demonstration data
          </button>
        </div>

        <Disclosure summary={`Column reference for ${schema.label}`}>
          <div className="table-wrap">
            <table>
              <caption>
                An empty cell records a value as missing. The word UNKNOWN records it as
                unknown, and EXCLUDED records it as deliberately out of scope. A cell
                containing 0 is a known zero, which is a different thing from all three.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Column</th>
                  <th scope="col">Required</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">Example</th>
                </tr>
              </thead>
              <tbody>
                {schema.columns.map((column) => (
                  <tr key={column.name}>
                    <th scope="row">
                      <code>{column.name}</code>
                    </th>
                    <td>{column.required ? 'Yes' : 'No'}</td>
                    <td>{column.description}</td>
                    <td>
                      <code>{column.example}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>

        <Disclosure summary="Example files to try">
          <p style={{ marginBottom: '0.75rem' }}>
            All of these are fictional. The invalid ones are meant to fail, so you can see
            how problems are reported.
          </p>
          <ul className="stack-tight">
            <li>
              <a href="fixtures/valid-baseline/employees.csv" download>
                A valid employees file
              </a>{' '}
              — six fictional employees
            </li>
            <li>
              <a href="fixtures/invalid-imports/employees-duplicate-id.csv" download>
                Duplicate identifier
              </a>
            </li>
            <li>
              <a href="fixtures/invalid-imports/employees-invalid-number.csv" download>
                Invalid amount
              </a>
            </li>
            <li>
              <a href="fixtures/invalid-imports/employees-missing-required.csv" download>
                Missing required field
              </a>
            </li>
            <li>
              <a href="fixtures/invalid-imports/employees-unknown-column.csv" download>
                Unrecognised column
              </a>
            </li>
            <li>
              <a href="fixtures/invalid-imports/overtime-invalid-date.csv" download>
                Invalid month (overtime table)
              </a>
            </li>
            <li>
              <a href="fixtures/invalid-imports/overtime-inconsistent-total.csv" download>
                Dollars recorded against zero hours (overtime table)
              </a>
            </li>
          </ul>
        </Disclosure>
      </div>
    </section>
  );
}
