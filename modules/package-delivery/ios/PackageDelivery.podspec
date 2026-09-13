Pod::Spec.new do |s|
  s.name = 'PackageDelivery'
  s.version = '1.0.0'
  s.summary = 'Verified Apple-hosted sample installation'
  s.description = 'On-demand delivery into durable app-local learning packages.'
  s.author = 'Project contributors'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '26.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.frameworks = 'BackgroundAssets'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_VERSION' => '6.0', 'SWIFT_STRICT_CONCURRENCY' => 'complete' }
  s.source_files = '**/*.swift'
end
