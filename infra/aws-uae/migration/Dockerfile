FROM postgres:17.6-bookworm

ENV PGCONNECT_TIMEOUT=10

COPY infra/aws-uae/db /opt/dabbir/db
RUN chmod 0555 /opt/dabbir/db/*.sh \
    && chmod 0444 /opt/dabbir/db/*.sql

ENTRYPOINT ["/opt/dabbir/db/migrate-dabbir-to-rds.sh"]
