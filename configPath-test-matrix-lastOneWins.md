TODO: Delete this file before merging

# `configPath` Test Matrix

## Scenario 1

### GIVEN for all cases:

```
root.collection/
├── library.a/
│   ├── ui5.yaml
│   ├── ui5-custom.yaml
│   └── ui5-another-custom.yaml
├── library.b/
│   ├── ui5.yaml
│   ├── ui5-custom.yaml
│   └── ui5-another-custom.yaml
└── collection.a/
    ├── library.c/
    │   ├── ui5.yaml
    │   ├── ui5-custom.yaml
    │   └── ui5-another-custom.yaml
    └── library.d/
        ├── ui5.yaml
        ├── ui5-custom.yaml
        └── ui5-another-custom.yaml
```

---

### ✅ Case 1.1: [workspace/1.1] No configPath

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`


### ✅ Case 1.2: [workspace/1.1] Custom configPath for all libs

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
      configPath: ui5-custom.yaml
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5-custom.yaml`
| `library.b`         | `ui5-custom.yaml`
| `collection.a/library.c` | `ui5-custom.yaml`
| `collection.a/library.d` | `ui5-custom.yaml`


### ✅ Case 1.3: [workspace/1.1] No configPath + Custom configPath for single lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	- path: ../root.collection/library.a
	  configPath: ui5-custom.yaml
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5-custom.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`

### ✅ Case 1.4: [workspace/1.1] Custom configPath for single lib + No configPath for all libs

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection/library.a
	  configPath: ui5-custom.yaml
    - path: ../root.collection # overwrites the prev. config entirely
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`

### ✅ Case 1.5: [workspace/1.1] Custom configPath for all libs + No configPath for single lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	  configPath: ui5-custom.yaml
	- path: ../root.collection/library.a
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5-custom.yaml`
| `collection.a/library.c` | `ui5-custom.yaml`
| `collection.a/library.d` | `ui5-custom.yaml`

### ✅ Case 1.6: [workspace/1.1] No configPath for all libs + Custom configPaths for two libs

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	- path: ../root.collection/library.a
	  configPath: ui5-custom.yaml
	- path: ../root.collection/library.b
	  configPath: ui5-another-custom.yaml
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5-custom.yaml`
| `library.b`         | `ui5-another-custom.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`

### ✅ Case 1.7: [workspace/1.1] No configPath for all libs + Two custom configPaths for single lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	- path: ../root.collection/library.a
	  configPath: ui5-custom.yaml
	- path: ../root.collection/library.a
	  configPath: ui5-another-custom.yaml
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5-another-custom.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`

**Remark:** For the validation, maybe log a warning (because multiple resolutions for the same library exist).

### ✅ Case 1.8: [workspace/1.1] No configPath for all libs + Custom configPath for sub collection

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	- path: ../root.collection/collection.a
	  configPath: ui5-custom.yaml
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5-custom.yaml`
| `collection.a/library.d` | `ui5-custom.yaml`

### ✅ Case 1.9: [workspace/1.1] No configPath for all libs + Custom configPaths for sub collection & single lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	- path: ../root.collection/collection.a
	  configPath: ui5-custom.yaml
	- path: ../root.collection/collection.a/library.c
	  configPath: ui5-another-custom.yaml  
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5-another-custom.yaml`
| `collection.a/library.d` | `ui5-custom.yaml`

### ✅ Case 1.10: [workspace/1.1] Two custom configPaths for the same single lib (ordering isolation)

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection/library.a
      configPath: ui5-custom.yaml
    - path: ../root.collection/library.a # same lib, later resolution
      configPath: ui5-another-custom.yaml
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5-another-custom.yaml`

Only `library.a` is resolved (the two resolutions collapse into a single module).
This case isolates the concept **the last resolution wins** from the original logic("specificity wins").

---
---

## Scenario 2

### GIVEN for all cases:

```
root.collection/
├── library.a/
│   ├── ui5.yaml
│	│   # missing ui5-custom.yaml
│   └── ui5-another-custom.yaml
├── library.b/
│   ├── ui5.yaml
│   ├── ui5-custom.yaml
│   └── ui5-another-custom.yaml
└── collection.a/
    ├── library.c/
    │   ├── ui5.yaml
    │   ├── ui5-custom.yaml
    │   └── ui5-another-custom.yaml
    └── library.d/
        ├── ui5.yaml
        ├── ui5-custom.yaml
        └── ui5-another-custom.yaml
```

---

### Case 2.1: [workspace/1.1] No configPath -- **⚠️ NO AUTOMATED TEST**

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`


### ✅ Case 2.2: [workspace/1.1] Custom configPath for all libs -> File not existing for single lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
      configPath: ui5-custom.yaml
```

**THEN**

Error: `Cannot find config file 'ui5-custom.yaml' for path '../root.collection/library.a'`


### ✅ Case 2.3: [workspace/1.1] Custom configPath for single lib -> File not existing for single lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	- path: ../root.collection/library.a
	  configPath: ui5-custom.yaml
```

**THEN**

Error: `Cannot find config file 'ui5-custom.yaml' for path '../root.collection/library.a'`

### ✅ Case 2.4: [workspace/1.1] Not existing configPath for single lib overwritten by No configPath for all libs

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection/library.a
	  configPath: ui5-custom.yaml
    - path: ../root.collection # overwrites the prev. config entirely
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`

### ✅ Case 2.5: [workspace/1.1] Not existing configPath for single lib overwritten by No configPath for the same lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	  configPath: ui5-custom.yaml
	- path: ../root.collection/library.a
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5.yaml`
| `library.b`         | `ui5-custom.yaml`
| `collection.a/library.c` | `ui5-custom.yaml`
| `collection.a/library.d` | `ui5-custom.yaml`

### ✅ Case 2.6: [workspace/1.1] Not existing configPath for single lib overwritten by Custom configPath for the same lib

**WHEN**

```yaml
specVersion: "workspace/1.1"
metadata:
  name: default
dependencyManagement:
  resolutions:
    - path: ../root.collection
	- path: ../root.collection/library.a
	  configPath: ui5-custom.yaml
	- path: ../root.collection/library.a
	  configPath: ui5-another-custom.yaml
```

**THEN**

| Resolved library | Config file used |
|------------------|------------------|
| `library.a`         | `ui5-another-custom.yaml`
| `library.b`         | `ui5.yaml`
| `collection.a/library.c` | `ui5.yaml`
| `collection.a/library.d` | `ui5.yaml`

**Remark:** For the validation, maybe log a warning (because multiple resolutions for the same library exist).
