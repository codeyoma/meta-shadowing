# Emit only allowlisted phase names and verdicts. Compiler arguments, source
# paths and diagnostic payloads must not enter the hosted console.
/^Resolve Package Graph/ { print "Native build: ResolvePackageGraph"; fflush() }
/^(ComputePackagePrebuildTargetDependencyGraph|ComputeTargetDependencyGraph|CreateBuildDescription|GatherProvisioningInputs|SwiftExplicitDependencyGeneratePcm|SwiftExplicitDependencyCompileModuleFromInterface|ScanDependencies|SwiftCompile|SwiftEmitModule|SwiftDriver|CompileAssetCatalog|CompileAssetCatalogVariant|CompileStoryboard|CompileXIB|ProcessInfoPlistFile|Copy|CpResource|CodeSign|Ld|PhaseScriptExecution)([[:space:]]|$)/ {
    if ($1 != previous_phase) {
        print "Native build: " $1
        fflush()
        previous_phase = $1
    }
}
/(^|[[:space:]])error:/ {
    if (!reported_error) {
        print "Native build: compiler error reported"
        fflush()
        reported_error = 1
    }
}
/^\*\* (BUILD|TEST BUILD) (SUCCEEDED|FAILED) \*\*$/ {
    print
    fflush()
}
