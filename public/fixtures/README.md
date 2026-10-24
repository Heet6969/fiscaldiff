# Import fixtures — all synthetic

Every file in these folders is fictional. None of it comes from a real
municipality, a real payroll system, a prior spreadsheet, or any prior project.

## `valid-baseline/`

A small, valid employee file you can import to see a successful import replace the
cohort. The figures are invented.

You can also produce valid files for any table by using **Download current data** in
the application: exports are written in the same schema the importer accepts, so
export and re-import is a genuine round trip.

## `invalid-imports/`

Each file isolates exactly one kind of failure, so you can see the error reporting
behave. These are *meant* to fail:

| File | The problem it demonstrates |
|---|---|
| `employees-duplicate-id.csv` | The same `employee_id` appears twice |
| `employees-invalid-number.csv` | `annual_base_salary` is not a valid amount |
| `employees-missing-required.csv` | A required field is empty |
| `employees-unknown-column.csv` | A column the schema does not define |
| `overtime-invalid-date.csv` | `month` is not `YYYY-MM` |
| `overtime-inconsistent-total.csv` | Dollars above zero recorded against zero hours |

A failed import changes nothing. The data you had before the attempt stays exactly
as it was.

## A note on the overtime spike

The demonstration overtime history contains a pronounced winter spike. It is there
as a **review example** — something a person should look at. It is not evidence of
wrongdoing, and the application does not infer a cause for it.
