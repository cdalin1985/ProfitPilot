# AWS environment foundation

This root creates one isolated Profit Pilot environment: a three-tier VPC, private Aurora PostgreSQL, encrypted Redis, KMS, encrypted/versioned object storage, immutable container repositories, an ECS cluster, and retained application log groups.

It deliberately does not create DNS, certificates, public load balancers, task definitions, or production services. Those resources require the real domain, WorkOS configuration, pushed image digests, secret ARNs, and alert destinations. Creating them before those inputs exist would produce an exposed or nonfunctional deployment.

## State bootstrap

Create an encrypted, versioned S3 state bucket in the shared-services account and grant the environment deployment role access. Initialize with explicit backend values:

```powershell
terraform init `
  -backend-config="bucket=$env:TF_STATE_BUCKET" `
  -backend-config="key=profit-pilot/$env:TF_ENVIRONMENT/terraform.tfstate" `
  -backend-config="region=$env:AWS_REGION"
```

Never place backend account identifiers or credentials in this repository. State locking uses the S3 lockfile mechanism.

## Plan

Authenticate through AWS IAM Identity Center or CI workload identity, then:

```powershell
terraform fmt -check -recursive
terraform validate
terraform plan -var="environment=$env:TF_ENVIRONMENT" -out=tfplan
terraform show -json tfplan
```

For production, set `nat_gateway_count=3`, retain deletion protection, and review the plan from a protected CI environment. Apply the saved plan only after security, cost, and migration approval.

The generated Redis credential and RDS administrator credential are encrypted in AWS Secrets Manager. Terraform state is sensitive because it contains the generated Redis token; the remote state bucket therefore requires KMS encryption, versioning, access logging, and tightly scoped roles.
