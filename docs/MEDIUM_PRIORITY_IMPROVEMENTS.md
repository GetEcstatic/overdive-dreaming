# Medium Priority Improvements

These improvements were identified during codebase health review on 2026-01-25.

## ✅ COMPLETED: Split Large Form Components

**Status:** Partially complete - reusable components extracted

**New Components Created:**
```
src/lib/components/forms/
├── index.ts                    # Exports all form components
├── SessionDateTimePicker.svelte  # Date/time input
├── VisibilityToggle.svelte       # Public/private toggle
├── DisciplineSelector.svelte     # Discipline radio buttons
├── SelectableTagsInput.svelte    # Tag toggle buttons
└── CompetitionToggle.svelte      # Competition mode with cards/records
```

**Remaining Work:**
- Integrate these components into QuickLogForm.svelte
- Integrate these components into EditableLogForm.svelte
- Extract additional sections (PerformanceMetrics, BiometricInputs, etc.)

---

## 1. Consolidate Routine Builders

**Current State:**
- `RoutineBuilder.svelte` (396 lines) - Original 5-step wizard
- `SimplifiedRoutineBuilder.svelte` (709 lines) - New streamlined 4-step wizard

**Recommendation:**
Consider deprecating `RoutineBuilder.svelte` and fully migrating to `SimplifiedRoutineBuilder.svelte`. The simplified builder has:
- Clearer 3-type model (max-attempt, interval-series, hybrid)
- Better tag configuration (default + selectable tags)
- Tracking presets (minimal/standard/full/custom)

**Files to review:**
- `src/lib/components/routine-builder/RoutineBuilder.svelte`
- `src/lib/components/routine-builder/SimplifiedRoutineBuilder.svelte`
- Routes that may still reference the old builder

---

## 2. Extract Shared Styles

**Current State:**
Many components have duplicate CSS for common patterns:
- Form sections (.form-section, .form-group)
- Tag buttons (.tag-btn, .selected)
- Button styles (.btn, .btn-primary, .btn-danger)
- Card layouts (.card, .card-content)

**Recommendation:**
Create shared utility classes in `src/app.css` or a dedicated `src/lib/styles/` folder:
- `_forms.css` - Form field and section styles
- `_buttons.css` - Button variants
- `_tags.css` - Tag/chip component styles
- `_cards.css` - Card layouts

**Files with most duplication:**
- `src/lib/components/routine-builder/simplified/*.svelte`
- `src/lib/components/QuickLogForm.svelte`
- `src/lib/components/EditableLogForm.svelte`

---

## 3. Add Form Validation Helpers

**Current State:**
Form validation is implemented inline in each component, leading to:
- Duplicated validation logic
- Inconsistent error messages
- No centralized validation rules

**Recommendation:**
Create a validation utility module at `src/lib/utils/validation.ts`:

```typescript
// Example structure
export const validators = {
  required: (value: unknown) => value !== undefined && value !== '',
  minLength: (min: number) => (value: string) => value.length >= min,
  positiveNumber: (value: number) => value > 0,
  validDuration: (value: number) => value >= 0,
  // etc.
};

export function validateForm<T>(data: T, rules: ValidationRules<T>): ValidationResult;
```

**Benefits:**
- Consistent validation across forms
- Reusable in QuickLogForm, EditableLogForm, RoutineBuilder
- Easier to add new validation rules

---

## 4. Split Large Form Components

**Current State:**
- `QuickLogForm.svelte` - 2,136 lines
- `EditableLogForm.svelte` - 1,770 lines

These components are too large and handle too many concerns.

**Recommendation:**
Break into smaller, reusable sub-components:

```
src/lib/components/
├── forms/
│   ├── SessionDatePicker.svelte
│   ├── DisciplineSelector.svelte
│   ├── PerformanceMetrics.svelte
│   ├── BiometricInputs.svelte
│   ├── TrainingContextInputs.svelte
│   ├── TagsInput.svelte
│   ├── MediaAttachments.svelte
│   └── VisibilityToggle.svelte
├── QuickLogForm.svelte  (orchestrator)
└── EditableLogForm.svelte (orchestrator)
```

**Priority sub-components to extract:**
1. Biometric inputs (SpO2, HR per rep) - complex logic
2. Performance metrics section - reused in both forms
3. Tag selection - increasingly important feature

---

## TODOs Still in Codebase

Two TODO comments were found:

1. **Analytics filtering** (`src/routes/(app)/analytics/+page.svelte:422`)
   ```typescript
   // TODO: Add routine-specific filtering in future
   ```
   - Add ability to filter analytics by specific routine

2. **Delete subcollections** (`src/lib/firestore.ts:253`)
   ```typescript
   // TODO: Also delete subcollections (routineLogs, dives)
   ```
   - When deleting a routine, cascade delete related data

---

## Test Coverage

**Current State:** No test framework configured.

**Recommendation:**
1. Add Vitest for unit tests
2. Add Playwright for E2E tests
3. Priority test areas:
   - Firestore CRUD operations
   - Form validation logic
   - Analytics calculations
   - Routine builder state management

---

## Timeline Suggestion

| Week | Task |
|------|------|
| 1 | Extract shared styles, add validation helpers |
| 2 | Split QuickLogForm into sub-components |
| 3 | Split EditableLogForm, reuse sub-components |
| 4 | Deprecate old RoutineBuilder, complete TODOs |
| 5 | Add basic test coverage |
