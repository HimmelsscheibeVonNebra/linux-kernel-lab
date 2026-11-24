# Build environment for the Kernel Lab images (Buildroot host dependencies).
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential bc bison flex libssl-dev libelf-dev libncurses-dev \
        cpio unzip wget rsync file git python3 perl patch \
        xz-utils bzip2 gzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/tmp
WORKDIR /work
