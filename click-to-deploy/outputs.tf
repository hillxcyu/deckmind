# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

output "app_url" {
  description = "HTTPS URL of the DeckMind application behind the External ALB and IAP."
  value       = "https://${local.lb_hostname}"
}

output "lb_ip" {
  description = "Static external IP address of the Global HTTPS Load Balancer."
  value       = google_compute_global_address.web.address
}

output "lb_domain" {
  description = "Hostname configured on the managed SSL certificate."
  value       = local.lb_hostname
}

output "artifact_registry_repo" {
  description = "Artifact Registry repository URI for container images."
  value       = "${local.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "cloud_sql_instance" {
  description = "Cloud SQL PostgreSQL instance connection name."
  value       = google_sql_database_instance.postgres.connection_name
}

output "runtime_service_account" {
  description = "Least-privilege runtime service account email for Cloud Run."
  value       = google_service_account.runtime.email
}

output "iap_audience" {
  description = "Expected IAP JWT audience for backend service verification."
  value       = local.iap_audience
}
