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

### Case 1

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


### Case 2

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


### Case 3

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

### Case 4

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

### Case 5

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

### Case 6

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

### Case 7

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

### Case 8

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

### Case 9

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

### Case 1

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


### Case 2

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


### Case 3

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

### Case 4

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

### Case 5

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

### Case 6

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
