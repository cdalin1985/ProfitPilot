data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name = "${var.project_name}-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)
}

resource "aws_kms_key" "application" {
  description             = "${local.name} application data"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "application" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.application.key_id
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count = var.availability_zone_count

  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  map_public_ip_on_launch = false
  vpc_id                  = aws_vpc.this.id

  tags = {
    Name = "${local.name}-public-${count.index + 1}"
    Tier = "public"
  }
}

resource "aws_subnet" "application" {
  count = var.availability_zone_count

  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  vpc_id            = aws_vpc.this.id

  tags = {
    Name = "${local.name}-application-${count.index + 1}"
    Tier = "application"
  }
}

resource "aws_subnet" "data" {
  count = var.availability_zone_count

  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  vpc_id            = aws_vpc.this.id

  tags = {
    Name = "${local.name}-data-${count.index + 1}"
    Tier = "data"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-public" }
}

resource "aws_route" "public_internet" {
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
  route_table_id         = aws_route_table.public.id
}

resource "aws_route_table_association" "public" {
  count = var.availability_zone_count

  route_table_id = aws_route_table.public.id
  subnet_id      = aws_subnet.public[count.index].id
}

resource "aws_eip" "nat" {
  count  = var.nat_gateway_count
  domain = "vpc"

  depends_on = [aws_internet_gateway.this]
  tags       = { Name = "${local.name}-nat-${count.index + 1}" }
}

resource "aws_nat_gateway" "this" {
  count = var.nat_gateway_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = { Name = "${local.name}-${count.index + 1}" }
}

resource "aws_route_table" "application" {
  count = var.availability_zone_count

  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-application-${count.index + 1}" }
}

resource "aws_route" "application_internet" {
  count = var.availability_zone_count

  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[count.index % var.nat_gateway_count].id
  route_table_id         = aws_route_table.application[count.index].id
}

resource "aws_route_table_association" "application" {
  count = var.availability_zone_count

  route_table_id = aws_route_table.application[count.index].id
  subnet_id      = aws_subnet.application[count.index].id
}

resource "aws_security_group" "application" {
  name        = "${local.name}-application"
  description = "Application workloads"
  vpc_id      = aws_vpc.this.id

  egress {
    from_port   = 0
    protocol    = "-1"
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL from application workloads"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.application.id]
    to_port         = 5432
  }
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-redis"
  description = "Redis from application workloads"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.application.id]
    to_port         = 6379
  }
}

resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_rds_cluster" "this" {
  cluster_identifier              = local.name
  database_name                   = var.database_name
  db_subnet_group_name            = aws_db_subnet_group.this.name
  deletion_protection             = var.deletion_protection
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  master_username                 = var.database_master_username
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = aws_kms_key.application.arn
  port                            = 5432
  preferred_backup_window         = "04:00-05:00"
  preferred_maintenance_window    = "sun:05:00-sun:06:00"
  backup_retention_period         = 14
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.application.arn
  vpc_security_group_ids          = [aws_security_group.database.id]
  copy_tags_to_snapshot           = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name}-final"

  serverlessv2_scaling_configuration {
    max_capacity = var.database_max_capacity
    min_capacity = var.database_min_capacity
  }
}

resource "aws_rds_cluster_instance" "this" {
  count = var.database_instance_count

  cluster_identifier   = aws_rds_cluster.this.id
  db_subnet_group_name = aws_db_subnet_group.this.name
  engine               = aws_rds_cluster.this.engine
  instance_class       = "db.serverless"
  monitoring_interval  = 60
  publicly_accessible  = false
}

resource "random_password" "redis" {
  length  = 48
  special = false
}

resource "aws_elasticache_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = local.name
  description                = "${local.name} cache and job coordination"
  engine                     = "redis"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  kms_key_id                 = aws_kms_key.application.arn
  snapshot_retention_limit   = 7
  maintenance_window         = "sun:06:00-sun:07:00"
  apply_immediately          = false
}

resource "aws_secretsmanager_secret" "redis" {
  name                    = "${local.name}/redis"
  description             = "Redis connection material for ${local.name}"
  kms_key_id              = aws_kms_key.application.arn
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({
    auth_token = random_password.redis.result
    endpoint   = aws_elasticache_replication_group.this.primary_endpoint_address
    port       = aws_elasticache_replication_group.this.port
    tls        = true
  })
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "${local.name}-${data.aws_caller_identity.current.account_id}-artifacts"
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.application.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_ecr_repository" "web" {
  name                 = "${local.name}/web"
  image_tag_mutability = "IMMUTABLE"

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.application.arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.name}/api"
  image_tag_mutability = "IMMUTABLE"

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.application.arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/${local.name}/web"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.application.arn
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/${local.name}/api"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.application.arn
}

resource "aws_cloudwatch_log_group" "redirect" {
  name              = "/${local.name}/redirect"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.application.arn
}

resource "aws_cloudwatch_log_group" "event_ingestion" {
  name              = "/${local.name}/event-ingestion"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.application.arn
}
