"use strict";
import * as tl from "vsts-task-lib/task";
import * as fs from "fs";
import ContainerConnection from "docker-common/containerconnection";
import * as sourceUtils from "docker-common/sourceutils";
import * as imageUtils from "docker-common/containerimageutils";

export function getImageNames(): string[] {
    let imageNamesFilePath = tl.getPathInput("imageNamesPath", /* required */ true, /* check exists */ true);
    let imageNames = fs.readFileSync(imageNamesFilePath, "utf-8").trim().replace("\r\n", "\n").split("\n");
    if (!imageNames.length) {
        throw new Error(tl.loc("NoImagesInImageNamesFile", imageNamesFilePath));
    }

    return imageNames.map(n => imageUtils.generateValidImageName(n));
}

export function getImageMappings(connection: ContainerConnection, imageNames: string[]): ImageMapping[] {
    let qualifyImageName = tl.getBoolInput("qualifyImageName");
    let imageInfos: ImageInfo[] = imageNames.map(imageName => {
        let qualifiedImageName = qualifyImageName ? connection.qualifyImageName(imageName) : imageName;
        return {
            sourceImageName: imageName,
            qualifiedImageName: qualifiedImageName,
            baseImageName: imageUtils.imageNameWithoutTag(qualifiedImageName),
            taggedImages: []
        };
    });

    let additionalImageTags = tl.getDelimitedInput("additionalImageTags", "\n");
    let includeSourceTags = tl.getBoolInput("includeSourceTags");
    let includeLatestTag = tl.getBoolInput("includeLatestTag");

    let sourceTags: string[] = [];
    if (includeSourceTags) {
        sourceTags = sourceUtils.getSourceTags();
    }

    let commonTags: string[] = additionalImageTags.concat(sourceTags);

    // For each of the image names, generate a mapping from the source image name to the target image.  The same source image name
    // may be listed more than once if there are multiple tags.  The target image names will be tagged based on the task configuration.
    for (let i = 0; i < imageInfos.length; i++) {
        let imageInfo = imageInfos[i];
        let imageSpecificTags: string[] = [];
        if (imageInfo.baseImageName === imageInfo.qualifiedImageName) {
            imageSpecificTags.push("latest");
        } else {
            imageInfo.taggedImages.push(imageInfo.qualifiedImageName);
            if (includeLatestTag) {
                imageSpecificTags.push("latest");
            }
        }

        commonTags.concat(imageSpecificTags).forEach(tag => {
            imageInfo.taggedImages.push(imageInfo.baseImageName + ":" + tag);
        });
    }

    // Flatten the image infos into a mapping between the source images and each of their tagged target images
    let sourceToTargetMapping: ImageMapping[] = [];
    imageInfos.forEach(imageInfo => {
        imageInfo.taggedImages.forEach(taggedImage => {
            sourceToTargetMapping.push({
                sourceImageName: imageInfo.sourceImageName,
                targetImageName: taggedImage
            });
        });
    });

    return sourceToTargetMapping;
}

interface ImageInfo {
    /**
     * The original, unmodified, image name provided as input to the task
     */
    sourceImageName: string;

    /**
     * The source image name, qualified with the connection endpoint if configured to do so.
     */
    qualifiedImageName: string;

    /**
     * The qualified image name with any tagging removed.
     */
    baseImageName: string;

    /**
     * The collection of qualifed and tagged images associated with the source image.
     */
    taggedImages: string[];
}

export interface ImageMapping {
    sourceImageName: string;
    targetImageName: string;
}