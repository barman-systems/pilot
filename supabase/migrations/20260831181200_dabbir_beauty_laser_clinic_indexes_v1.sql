create index if not exists dabbir_clinic_packages_service_fk_idx on public.dabbir_clinic_packages(business_id,service_id);
create index if not exists dabbir_clinic_sessions_device_fk_idx on public.dabbir_clinic_sessions(business_id,device_id);
create index if not exists dabbir_clinic_sessions_service_fk_idx on public.dabbir_clinic_sessions(business_id,service_id);
create index if not exists dabbir_clinic_sessions_worker_fk_idx on public.dabbir_clinic_sessions(business_id,worker_id);
create index if not exists dabbir_clinic_sessions_created_by_fk_idx on public.dabbir_clinic_sessions(created_by);
