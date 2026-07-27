output "application_subnet_ids" {
  description = "Private subnets for ECS tasks."
  value       = aws_subnet.application[*].id
}

output "application_security_group_id" {
  description = "Security group assigned to application workloads."
  value       = aws_security_group.application.id
}

output "artifact_bucket" {
  description = "Encrypted artifact and export bucket."
  value       = aws_s3_bucket.artifacts.id
}

output "database_endpoint" {
  description = "Aurora writer endpoint."
  value       = aws_rds_cluster.this.endpoint
}

output "database_master_secret_arn" {
  description = "AWS-managed database administrator credential."
  value       = aws_rds_cluster.this.master_user_secret[0].secret_arn
  sensitive   = true
}

output "ecs_cluster_arn" {
  description = "ECS cluster that receives application services."
  value       = aws_ecs_cluster.this.arn
}

output "redis_secret_arn" {
  description = "Redis endpoint and generated authentication token."
  value       = aws_secretsmanager_secret.redis.arn
  sensitive   = true
}

output "web_repository_url" {
  description = "Immutable ECR repository for the web image."
  value       = aws_ecr_repository.web.repository_url
}

output "api_repository_url" {
  description = "Immutable ECR repository for the API image."
  value       = aws_ecr_repository.api.repository_url
}
