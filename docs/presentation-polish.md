Presentation polish applied directly to the uploaded b3f2e87 source snapshot.

- Fictional municipality renamed to Town of Trala La (fictional), with its journey assertion updated. Production build and unit tests rerun after rename; branding checks passed.
- Offer B controls use two flexible columns and a separate Remove row.
- Buttons stay within the fieldset at 1280px, 1440px and 380px.
- Scope checkboxes use compact separated rows and shorter hints. Employer costs are described as outside the synthetic demo scope, requiring additional employee information and calculation rules.
- Component detail table has a stable order and explicit reasons for unsupported or missing values.
- Blocked reconciliation explains why no calculation steps were produced.
- Missing proposal totals now explain that budget position cannot be calculated instead of incorrectly claiming no budget was entered.
- Calculation logic, dependencies and data were not changed; shared exclusion text in engine/config.ts was updated.

Validation: 249 unit tests passed; production build including TypeScript passed; 156 browser tests passed for the preceding polish revision; after this wording-only follow-up, the journey and review-fix browser suites passed again. Employer-cost explanations now use demo-scope wording throughout the component table, shared exclusion notes, CSV and print. Separate scripted browser checks verified button containment and scope explanations at 1280px, 1440px and 380px. Desktop screenshots inspected.

Known limitations remain: taxes, pension, benefits, staffing changes and step progression are not modeled. CSV main breakdown is for Offer A. The automatic Kiro hook remains unverified.

These edits were performed in ChatGPT using the uploaded source; they were not made by Kiro and have not been committed or pushed to GitHub.
