{
  'targets': [
    {
      'target_name': 'validation',
      'include_dirs': ["<!(node -e \"require('nan')\")"],
      'cflags!': [ '-O3' ],
      'cflags': [ '-O2' ],
      'defines' : ['DELAYIMP_INSECURE_WRITABLE_HOOKS'],
      'sources': [ 'src/validation.cc' ]
    },
    {
      'target_name': 'bufferutil',
      'include_dirs': ["<!(node -e \"require('nan')\")"],
      'cflags!': [ '-O3' ],
      'cflags': [ '-O2' ],
      'defines' : ['DELAYIMP_INSECURE_WRITABLE_HOOKS'],
      'sources': [ 'src/bufferutil.cc' ]
    }
  ]
}
