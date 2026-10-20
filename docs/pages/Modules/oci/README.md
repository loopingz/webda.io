---
sidebar_label: "@webda/oci"
---
# oci
**@webda/oci**

***

# @webda/oci

## Classes

- [ContainerDeployer](/typedoc/oci/classes/ContainerDeployer)
- [ContainerDeployerParameters](/typedoc/oci/classes/ContainerDeployerParameters)
- [ImageLayout](/typedoc/oci/classes/ImageLayout)
- [RegistryClient](/typedoc/oci/classes/RegistryClient)
- [RegistryError](/typedoc/oci/classes/RegistryError)

## Interfaces

- [AuthChallenge](/typedoc/oci/interfaces/AuthChallenge)
- [BuildImageOptions](/typedoc/oci/interfaces/BuildImageOptions)
- [BuiltImage](/typedoc/oci/interfaces/BuiltImage)
- [BuiltPlatformImage](/typedoc/oci/interfaces/BuiltPlatformImage)
- [Descriptor](/typedoc/oci/interfaces/Descriptor)
- [FetchedManifest](/typedoc/oci/interfaces/FetchedManifest)
- [HistoryEntry](/typedoc/oci/interfaces/HistoryEntry)
- [ImageConfiguration](/typedoc/oci/interfaces/ImageConfiguration)
- [ImageIndex](/typedoc/oci/interfaces/ImageIndex)
- [ImageManifest](/typedoc/oci/interfaces/ImageManifest)
- [ImageReference](/typedoc/oci/interfaces/ImageReference)
- [PlainRegistryCredentials](/typedoc/oci/interfaces/PlainRegistryCredentials)
- [Platform](/typedoc/oci/interfaces/Platform)
- [RegistryClientOptions](/typedoc/oci/interfaces/RegistryClientOptions)
- [RegistryCredentials](/typedoc/oci/interfaces/RegistryCredentials)
- [RegistryOptions](/typedoc/oci/interfaces/RegistryOptions)
- [TarEntry](/typedoc/oci/interfaces/TarEntry)
- [TarOptions](/typedoc/oci/interfaces/TarOptions)

## Variables

- [DOCKER\_HUB](/typedoc/oci/variables/DOCKER_HUB)
- [DOCKER\_HUB\_API](/typedoc/oci/variables/DOCKER_HUB_API)
- [MANIFEST\_ACCEPT](/typedoc/oci/variables/MANIFEST_ACCEPT)
- [MediaTypes](/typedoc/oci/variables/MediaTypes)
- [SCRATCH](/typedoc/oci/variables/SCRATCH)

## Functions

- [buildImage](/typedoc/oci/functions/buildImage)
- [comparePaths](/typedoc/oci/functions/comparePaths)
- [createImageConfiguration](/typedoc/oci/functions/createImageConfiguration)
- [createRegistryClient](/typedoc/oci/functions/createRegistryClient)
- [forceUnixGzipOs](/typedoc/oci/functions/forceUnixGzipOs)
- [formatImageReference](/typedoc/oci/functions/formatImageReference)
- [formatPlatform](/typedoc/oci/functions/formatPlatform)
- [generateTar](/typedoc/oci/functions/generateTar)
- [getHelperCredentials](/typedoc/oci/functions/getHelperCredentials)
- [getRegistryApiHost](/typedoc/oci/functions/getRegistryApiHost)
- [isIndex](/typedoc/oci/functions/isIndex)
- [isPinnedBaseImage](/typedoc/oci/functions/isPinnedBaseImage)
- [isValidTag](/typedoc/oci/functions/isValidTag)
- [mergeEnv](/typedoc/oci/functions/mergeEnv)
- [parseAuthChallenge](/typedoc/oci/functions/parseAuthChallenge)
- [parseImageReference](/typedoc/oci/functions/parseImageReference)
- [parsePlatform](/typedoc/oci/functions/parsePlatform)
- [paxRecord](/typedoc/oci/functions/paxRecord)
- [platformMatches](/typedoc/oci/functions/platformMatches)
- [pushImage](/typedoc/oci/functions/pushImage)
- [readDockerConfig](/typedoc/oci/functions/readDockerConfig)
- [resolveCredentials](/typedoc/oci/functions/resolveCredentials)
- [sha256](/typedoc/oci/functions/sha256)
- [toJsonBytes](/typedoc/oci/functions/toJsonBytes)
- [toOciMediaType](/typedoc/oci/functions/toOciMediaType)
- [toTag](/typedoc/oci/functions/toTag)
- [withDirectories](/typedoc/oci/functions/withDirectories)
- [writeLayoutArchive](/typedoc/oci/functions/writeLayoutArchive)
